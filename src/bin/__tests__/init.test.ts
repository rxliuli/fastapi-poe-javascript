import { expect, it } from 'vitest'
import { init } from '../init'
import { initTempPath } from '@liuli-util/test'
import path from 'path'
import { pathExists } from '../../utils'
import { readFile } from 'fs/promises'

const tempPath = initTempPath(__filename)

it('should init', async () => {
  const distPath = path.resolve(tempPath, 'test')
  const accessKey = new Date().toISOString()
  await init({
    distPath: distPath,
    name: 'test',
    accessKey: accessKey,
  })
  expect(await pathExists(distPath)).true
  expect(await readFile(path.resolve(distPath, '.dev.vars'), 'utf-8')).includes(
    accessKey,
  )
  expect(
    JSON.parse(await readFile(path.resolve(distPath, 'package.json'), 'utf-8'))
      .name,
  ).equal('test')
  expect(
    await readFile(path.resolve(distPath, 'src/index.ts'), 'utf-8'),
  ).includes('test')
})

it('should overwrite', async () => {
  const distPath = path.resolve(tempPath, 'test')
  await init({
    distPath: distPath,
    name: 'test',
    accessKey: 'ACCESS_KEY_1',
  })
  const accessKey = 'ACCESS_KEY_2'
  await init({
    distPath: distPath,
    name: 'test',
    accessKey: accessKey,
  })
  expect(await readFile(path.resolve(distPath, '.dev.vars'), 'utf-8')).includes(
    accessKey,
  )
})
