# fastapi-poe

Create PoeAI server bot with JavaScript and Cloudflare Workers.

## Bootstrap Project

```bash
pnpm dlx fastapi-poe@latest init <project-name>
```

## Development

```ts
import { Hono } from 'hono'
import { poe } from 'fastapi-poe'

const app = new Hono()

interface Env {
  API_KEY: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const bot = poe({
      name: 'custom-bot-name',
      key: env.API_KEY,
      getSettings() {
        return {
          server_bot_dependencies: {
            'Claude-3.5-Sonnet': 10,
          },
          allow_attachments: false,
          suggested_replies: true,
          enable_markdown: true,
        }
      },
      async *getResponse(req) {
        // Stream request to PoeAI server
        for await (const response of bot.streamRequest(
          req,
          'Claude-3.5-Sonnet',
        )) {
          yield {
            text: response.text,
          }
        }
      },
    })
    app.post('/', bot.handler)
    app.get('/', async (c) => c.text('Hello Hono!'))
    return app.fetch(request, env, ctx)
  },
}
```
