import { Context, Handler } from 'hono'
import {
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
  set accessKey(value: string)

  syncBotSettings(): Promise<void>
  streamRequest(
    request: QueryRequest,
    botName: string,
  ): AsyncGenerator<BotMessage>
}

interface Options {
  name: string

  getResponse(request: QueryRequest): AsyncGenerator<PartialResponse>
  getSettings(
    request: SettingsRequest,
  ): SettingsResponse | Promise<SettingsResponse>
  onFeedback?(request: ReportFeedbackRequest): Promise<void>
  onError?(request: ReportErrorRequest): Promise<void>
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

export function sseTransformStream() {
  let buffer = ''
  return new TransformStream<
    string,
    {
      event: 'text'
      data: any
    }
  >({
    transform(chunk: string, controller: TransformStreamDefaultController) {
      buffer += chunk
      const textRegexp = /^event: text[\r\n]+data: ({[\s\S]*?})/
      const doneRegexp = /^event: done[\r\n]+data: ({})/
      while (buffer) {
        // console.log(
        //   !/^ping$/m.test(buffer) &&
        //     !doneRegexp.test(buffer) &&
        //     !textRegexp.test(buffer) &&
        //     buffer !== '' &&
        //     buffer !== 'event: text\r\ndata: {"text": ' &&
        //     buffer.trim() !== ': ping',
        // )
        buffer = buffer.trimStart()
        if (textRegexp.test(buffer)) {
          const match = buffer.match(textRegexp)
          if (match) {
            controller.enqueue({
              event: 'text',
              data: JSON.parse(match[1]),
            })
            buffer = buffer.replace(match[0], '').trimStart()
          }
        } else if (doneRegexp.test(buffer)) {
          const match = buffer.match(doneRegexp)
          if (match) {
            // controller.enqueue({
            //   event: 'done',
            //   data: JSON.parse(match[1]),
            // })
            buffer = buffer.replace(match[0], '').trimStart()
            controller.terminate()
            return
          }
          // ignore ping
        } else if (/^ping$/m.test(buffer)) {
          const match = buffer.match(/^ping$/m)
          if (match) {
            buffer = buffer.replace(match[0], '').trimStart()
          }
        } else if (buffer.trim() === ': ping') {
          buffer = buffer.replace(': ping', '').trimStart()
        } else {
          return
        }
      }
    },
    flush() {
      if (buffer.trim()) {
        console.warn('Unprocessed data in buffer:', buffer)
      }
    },
  })
}

async function* streamRequest(
  request: QueryRequest,
  botName: string,
  accessKey: string,
): AsyncGenerator<BotMessage> {
  const response = await fetch(`https://api.poe.com/bot/${botName}`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessKey}`,
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
    .pipeThrough(sseTransformStream())
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
  function handleQuery(query: QueryRequest, c: Context) {
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

  let key = ''
  const handler: Handler = async (c) => {
    if (!key) {
      throw new Error('Access Key is required')
    }
    const authHeader = c.req.header().authorization
    if (authHeader !== `Bearer ${key}`) {
      return c.text('Unauthorized', 401)
    }
    const req = (await c.req.json()) as RequestBody
    switch (req.type) {
      case 'query':
        return handleQuery(req, c)
      case 'settings':
        return c.json(await options.getSettings(req))
      case 'report_feedback':
        await options.onFeedback?.(req)
        return c.json({})
      case 'report_error':
        await options.onError?.(req)
        return c.json({})
      default:
        return c.text('501 Not Implemented', 501)
    }
  }
  if (!options.name) {
    throw new Error('name and key are required')
  }
  return {
    handler,
    set accessKey(value: string) {
      key = value
    },
    syncBotSettings: () => syncBotSettings(options.name, key),
    streamRequest: (request, botName) => streamRequest(request, botName, key),
  }
}
