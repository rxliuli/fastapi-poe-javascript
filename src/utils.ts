import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'path'

export const ROOT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

export const pathExists = async (path: string) =>
  access(path)
    .then(() => true)
    .catch(() => false)
