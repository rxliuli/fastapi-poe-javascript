# fastapi-poe

Create PoeAI server bot with JavaScript and Cloudflare Workers.

## Bootstrap Project

```bash
pnpm dlx fastapi-poe@latest init <project-name>
```

### Development

```sh
cd <project-name>
pnpm i
pnpm dev
```

### Deployment

```sh
pnpm run deploy
echo <access-key> | pnpm wrangler secret put ACCESS_KEY
```

## Basic Usage

```ts
import { poe } from 'fastapi-poe'

const bot = poe({
  name: 'custom-bot',
  // settings, https://creator.poe.com/docs/poe-protocol-specification#settings
  getSettings() {
    return {
      // declare other bots as dependencies
      server_bot_dependencies: {
        'Claude-3.5-Sonnet': 1,
      },
      allow_attachments: false,
      suggested_replies: true,
      enable_markdown: true,
    }
  },
  // get response from bot, https://creator.poe.com/docs/poe-protocol-specification#query
  async *getResponse(req) {
    // call other bots
    for await (const response of bot.streamRequest(req, 'Claude-3.5-Sonnet')) {
      yield {
        text: response.text,
      }
    }
  },
})
```
