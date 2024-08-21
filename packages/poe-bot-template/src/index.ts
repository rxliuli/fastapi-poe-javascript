import { Hono } from 'hono'
import { poe } from 'fastapi-poe'

const app = new Hono()

interface Env {
  ACCESS_KEY: string
}

const bot = poe({
  name: 'poe-bot-template',
  getSettings() {
    return {
      server_bot_dependencies: {
        'Claude-3.5-Sonnet': 1,
      },
    }
  },
  async *getResponse(req) {
    for await (const response of bot.streamRequest(req, 'Claude-3.5-Sonnet')) {
      yield {
        text: response.text,
      }
    }
  },
})

app.post('/', bot.handler)
app.get('/', async (c) => c.text('Hello Hono!'))

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    bot.accessKey = env.ACCESS_KEY
    return app.fetch(request, env, ctx)
  },
}
