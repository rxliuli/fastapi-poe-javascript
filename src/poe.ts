import { Handler, MiddlewareHandler } from 'hono'
import {
  MetaResponse,
  PartialResponse,
  QueryRequest,
  ReportErrorRequest,
  ReportFeedbackRequest,
  SettingsRequest,
  SettingsResponse,
} from './types'
import { streamSSE } from 'hono/streaming'

interface Bot {
  handler: Handler

  syncBotSettings(): Promise<void>
  streamRequest(
    request: QueryRequest,
    botName: string,
  ): AsyncGenerator<BotMessage>
}

interface Options {
  name: string
  key: string

  getResponse(request: QueryRequest): AsyncGenerator<PartialResponse>
  getSettings(
    request: SettingsRequest,
  ): SettingsResponse | Promise<SettingsResponse>
  onFeedback?(request: ReportFeedbackRequest): Promise<void>
  onError?(request: ReportErrorRequest): Promise<void>
}

function authenticate(key: string): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header().authorization
    if (authHeader !== `Bearer ${key}`) {
      return c.text('Unauthorized', 401)
    }
    await next()
  }
}

const PROTOCOL_VERSION = '1.0' // Assuming this is defined elsewhere

class BotError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BotError'
  }
}

async function syncBotSettings(
  botName: string,
  accessKey: string = '',
  baseUrl: string = 'https://api.poe.com/bot/fetch_settings',
): Promise<void> {
  const resp = await fetch(
    `${baseUrl}/${botName}/${accessKey}/${PROTOCOL_VERSION}`,
    {
      method: 'post',
    },
  )
  const text = await resp.text()
  if (!resp.ok) {
    throw new BotError(`Error fetching settings for bot ${botName}: ${text}`)
  }
  console.log(text)
}

interface BotMessage {
  text: string
  rawResponse: any
  fullPrompt: string
  isSuggestedReply?: boolean
  data?: any
}

type ParsedText = {
  event: 'text'
  data: {
    text: string
  }
}

type ParsedDone = {
  event: 'done'
  data: {}
}

export function parseSSEMessage(message: string): ParsedDone | ParsedText {
  const lines = message.split('\n')
  let event = '',
    data = ''

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      try {
        data = JSON.parse(line.slice(5).trim())
      } catch (error) {
        data = line.slice(5).trim()
      }
    }
  }
  if (!event || !data) {
    throw new Error('Invalid SSE message: ' + message)
  }
  return { event, data } as ParsedDone | ParsedText
}

export function streamSSETransformStream() {
  let buffer = ''
  return new TransformStream<
    string,
    {
      event: 'text' | 'done'
      data: any
    }
  >({
    transform(chunk: string, controller: TransformStreamDefaultController) {
      // console.log('chunk:', chunk)
      buffer += chunk.trim()

      if (buffer.endsWith('"}') || buffer.endsWith('{}')) {
        const eventMatch = buffer.match(/event:\s*(\w+)/)
        const dataMatch = buffer.match(/data:\s*({.*})/)

        if (eventMatch && dataMatch) {
          const event = eventMatch[1]
          const data = dataMatch[1]

          if (event === 'text' && data !== '{}') {
            controller.enqueue({
              event,
              data: JSON.parse(data),
            })
          } else if (event === 'done') {
            controller.terminate()
            return
          }
        }
        buffer = ''
      }
    },
    flush(controller: TransformStreamDefaultController) {
      if (buffer.trim()) {
        console.warn('Unprocessed data in buffer:', buffer)
      }
    },
  })
}

async function* streamRequest(
  request: QueryRequest,
  botName: string,
  apiKey: string,
): AsyncGenerator<BotMessage> {
  const baseUrl = 'https://api.poe.com/bot/'
  const url = `${baseUrl}${botName}`
  // 首先发送初始化请求
  const response = await fetch(url, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(request),
  })
  if (!response.ok || !response.body) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  const reader = response
    .body!.pipeThrough(new TextDecoderStream())
    .pipeThrough(streamSSETransformStream())
    .getReader()
  let chunk = await reader.read()
  while (!chunk.done) {
    const parsed = chunk.value as ParsedDone | ParsedText
    let text = ''
    switch (parsed.event) {
      case 'text':
        text = parsed.data.text
        break
      case 'done':
        break
      default:
        throw new Error(`Unexpected event: ${(parsed as any).event}`)
    }
    yield { text } as any
    chunk = await reader.read()
  }
}

function serialize(
  value:
    | {
        event: 'meta'
        data: MetaResponse
      }
    | {
        event: 'text'
        data: PartialResponse
      }
    | {
        event: 'done'
        data: {}
      },
): string {
  return `event: ${value.event}\ndata: ${JSON.stringify(value.data)}\n\n`
}

type RequestBody =
  | {
      version: string
    } & (
      | ({
          type: 'query'
        } & QueryRequest)
      | ({
          type: 'settings'
        } & SettingsRequest)
      | ({
          type: 'report_feedback'
        } & ReportFeedbackRequest)
      | ({ type: 'report_error' } & ReportErrorRequest)
    )

export function poe(options: Options): Bot {
  const handler: Handler = async (c) => {
    function handleQuery(query: QueryRequest) {
      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          event: 'meta',
          data: JSON.stringify({ content_type: 'text/markdown' }),
        })
        const list = options.getResponse(query)
        for await (const it of list) {
          if (it.is_replace_response) {
            stream.writeSSE({
              event: 'replace_response',
              data: JSON.stringify(it),
            })
          } else {
            stream.writeSSE({ event: 'text', data: JSON.stringify(it) })
          }
        }
        stream.writeSSE({ event: 'done', data: JSON.stringify({}) })
      })
    }
    const authHeader = c.req.header().authorization
    if (authHeader !== `Bearer ${options.key}`) {
      return c.text('Unauthorized', 401)
    }
    const body = (await c.req.json()) as RequestBody
    switch (body.type) {
      case 'query':
        return handleQuery(body)
      case 'settings':
        return c.json(await options.getSettings(body))
      case 'report_feedback':
        await options.onFeedback?.(body)
        return c.json({})
      case 'report_error':
        await options.onError?.(body)
        return c.json({})
      default:
        return c.text('501 Not Implemented', 501)
    }
  }
  if (!options.name || !options.key) {
    throw new Error('name and key are required')
  }
  return {
    handler,
    syncBotSettings: () => syncBotSettings(options.name, options.key),
    streamRequest: (request, botName) =>
      streamRequest(request, botName, options.key),
  }
}
