import { defineConfig } from 'vite'
import { node } from '@liuli-util/vite-plugin-node'

export default defineConfig({
  plugins: [
    node({
      shims: false,
      entry: ['./src/bin.ts', './src/index.ts'],
      dts: true,
    }),
  ],
})
