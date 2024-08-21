import { describe, expect, it } from 'vitest'
import { sseTransformStream } from '../poe'

describe('sseTransformStream', () => {
  function arrayToReadableStream(array: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        array.forEach((item) =>
          controller.enqueue(new TextEncoder().encode(item)),
        )
        controller.close()
      },
    })
  }

  function createReadStream(input: string[]) {
    const stream = arrayToReadableStream(input)
    return stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(sseTransformStream())
      .getReader()
  }

  it('解析单个消息', async () => {
    const input = `event: text\ndata: {"text":"Hello"}\n\n`
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(input))
        controller.close()
      },
    })
    const reader = stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(sseTransformStream())
      .getReader()

    const result = await reader.read()
    expect(result.value).deep.eq({ event: 'text', data: { text: 'Hello' } })
    expect(result.done).false

    const end = await reader.read()
    expect(end.done).true
  })
  it('解析多个消息', async () => {
    const input = `
      event: text\ndata: {"text":"Hello"}\n\n
      event: done\ndata: {}\n\n
      event: text\ndata: {"text":"This should not be processed"}\n\n
    `
    const reader = createReadStream([input])

    const result = await reader.read()
    expect(result.value).deep.eq({ event: 'text', data: { text: 'Hello' } })

    const end = await reader.read()
    expect(end.done).true
  })
  it('解析分割的消息', async () => {
    const reader = createReadStream([
      'event: text\ndata: {"text":\n',
      '"Hello"}\n\n',
    ])
    const result = await reader.read()
    expect(result.value).deep.eq({ event: 'text', data: { text: 'Hello' } })

    const end = await reader.read()
    expect(end.done).true
  })
  it('包含 ping 消息', async () => {
    const reader = createReadStream([
      'event: text\ndata: {"text":\n',
      '"Hello"}\n\n',
      'ping\n',
      'event: text\ndata: {"text":\n',
      '"World"}\n\n',
    ])
    const hello = await reader.read()
    expect(hello.value).deep.eq({ event: 'text', data: { text: 'Hello' } })

    const world = await reader.read()
    expect(world.value).deep.eq({ event: 'text', data: { text: 'World' } })

    const end = await reader.read()
    expect(end.done).true
  })
  it('Claude 3.5 Sonnet 的响应', async () => {
    const list = [
      `event: text\ndata: {"text":`,
      `"Hello"}`,
      `event: text\ndata: {"text":`,
      `"! I'm Claude,"}`,
      `event: text\ndata: {"text":`,
      `" an AI assistant."}`,
      `event: text\ndata: {"text":`,
      `" How"}`,
      `event: text\ndata: {"text":`,
      `" can"}`,
      `event: text\ndata: {"text":`,
      `" I help"}`,
      `event: text\ndata: {"text":`,
      `" you today?"}`,
      `event: text\ndata: {"text":`,
      `" I'm here"}`,
      `event: text\ndata: {"text":`,
      `" to assist with a"}`,
      `event: text\ndata: {"text": `,
      `" wide variety of tasks,"}`,
      `event: text\ndata: {"text":`,
      `" from"}`,
      `event: text\ndata: {"text":`,
      `" analysis and research"}`,
      `event: text\ndata: {"text":`,
      `" to creative"}`,
      `event: text\ndata: {"text":`,
      `" writing and coding. Please"}`,
      `event: text\ndata: {"text":`,
      `" feel"}`,
      `event: text\ndata: {"text":`,
      `" free to ask me anything"}`,
      `event: text\ndata: {"text":`,
      `" you'd like."}`,
      `event: text\ndata: {"text":`,
      `""}`,
      `event: done\ndata: {}`,
      ``,
    ]
    const reader = createReadStream(list)

    const result: { event: string; data: any }[] = []
    let chunk = await reader.read()
    while (!chunk.done) {
      result.push(chunk.value)
      chunk = await reader.read()
    }
    expect(result).deep.eq([
      { event: 'text', data: { text: 'Hello' } },
      { event: 'text', data: { text: "! I'm Claude," } },
      { event: 'text', data: { text: ' an AI assistant.' } },
      { event: 'text', data: { text: ' How' } },
      { event: 'text', data: { text: ' can' } },
      { event: 'text', data: { text: ' I help' } },
      { event: 'text', data: { text: ' you today?' } },
      { event: 'text', data: { text: " I'm here" } },
      { event: 'text', data: { text: ' to assist with a' } },
      { event: 'text', data: { text: ' wide variety of tasks,' } },
      { event: 'text', data: { text: ' from' } },
      { event: 'text', data: { text: ' analysis and research' } },
      { event: 'text', data: { text: ' to creative' } },
      { event: 'text', data: { text: ' writing and coding. Please' } },
      { event: 'text', data: { text: ' feel' } },
      { event: 'text', data: { text: ' free to ask me anything' } },
      { event: 'text', data: { text: " you'd like." } },
      { event: 'text', data: { text: '' } },
    ])
  })
  it('GPT-4o 的响应', async () => {
    const reader = createReadStream([
      `event: text
data: {"text": `,
      `""}

event: text
data: {"text": "Hello"}`,
      `event: text
data: {"text":`,
      `"!"}

event: text
data: {"text": " How"}`,
      `event: text
data: {"text":`,
      `" can"}

event: text
data: {"text": " I"}`,
      `event: text
data: {"text":`,
      `" assist"}

event: text
data: {"text": " you"}`,
      `event: text
data: {"text":`,
      `" today"}

event: text
data: {"text": "?"}`,
      `event: text
data: {"text": `,
      `""}`,
      `event: done
data: {}`,
    ])

    const result: { event: string; data: any }[] = []
    let chunk = await reader.read()
    while (!chunk.done) {
      result.push(chunk.value)
      chunk = await reader.read()
    }
    expect(result).deep.eq([
      { event: 'text', data: { text: '' } },
      { event: 'text', data: { text: 'Hello' } },
      { event: 'text', data: { text: '!' } },
      { event: 'text', data: { text: ' How' } },
      { event: 'text', data: { text: ' can' } },
      { event: 'text', data: { text: ' I' } },
      { event: 'text', data: { text: ' assist' } },
      { event: 'text', data: { text: ' you' } },
      { event: 'text', data: { text: ' today' } },
      { event: 'text', data: { text: '?' } },
      { event: 'text', data: { text: '' } },
    ])
  })
  it('GPT-4o 的错误响应', async () => {
    const input =
      'event: text\r\ndata: {"text":""}\r\n\r\nevent: text\r\ndata: {"text": "Hello"}'
    const reader = createReadStream([input])

    const result: { event: string; data: any }[] = []
    let chunk = await reader.read()
    while (!chunk.done) {
      result.push(chunk.value)
      chunk = await reader.read()
    }
    expect(result).deep.eq([
      { event: 'text', data: { text: '' } },
      { event: 'text', data: { text: 'Hello' } },
    ])
  })
  it('Claude 3.5 Sonnet 响应的 ping', async () => {
    const reader = createReadStream([
      'event: text\ndata: {"text":""}\n\n',
      ': ping\r\n\r\n',
      'event: text\ndata: {"text":""}\n\n',
    ])

    const result: { event: string; data: any }[] = []
    let chunk = await reader.read()
    while (!chunk.done) {
      result.push(chunk.value)
      chunk = await reader.read()
    }
    expect(result).deep.eq([
      { event: 'text', data: { text: '' } },
      { event: 'text', data: { text: '' } },
    ])
  })
})
