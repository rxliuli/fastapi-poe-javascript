import { cp, rename, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ROOT_PATH } from '../utils'

export async function init(options: {
  distPath: string
  name: string
  accessKey: string
}) {
  const srcPath = path.resolve(ROOT_PATH, './packages/poe-bot-template')
  await cp(srcPath, options.distPath, {
    recursive: true,
    force: true,
    dereference: true,
    filter: (source) => path.basename(source) !== 'node_modules',
  })
  await writeFile(
    path.resolve(options.distPath, '.dev.vars'),
    `ACCESS_KEY="${options.accessKey}"`,
  )
  const replace = async (fsPath: string, content: (c: string) => string) => {
    const file = await readFile(fsPath, 'utf-8')
    await writeFile(fsPath, content(file))
  }
  await Promise.all(
    ['package.json', 'wrangler.toml', 'src/index.ts']
      .map((it) =>
        replace(path.resolve(options.distPath, it), (c) =>
          c.replace('poe-bot-template', options.name),
        ),
      )
      .concat([
        rename(
          path.resolve(options.distPath, '_.gitignore'),
          path.resolve(options.distPath, '.gitignore'),
        ),
      ]),
  )
}
