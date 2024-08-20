import { Command } from 'commander'
import { version } from '../package.json'
import { confirm, password } from '@inquirer/prompts'
import path from 'path'
import { pathExists } from './utils'
import { init } from './bin/init'
import chalk from 'chalk'

new Command()
  .addCommand(
    new Command('init').arguments('<project-name>').action(async (name) => {
      const distPath = path.resolve(name)
      if (await pathExists(distPath)) {
        const isOverwrite = await confirm({
          message: 'Directory already exists, do you want to overwrite it?',
          default: false,
        })
        if (!isOverwrite) {
          return
        }
      }
      const accessKey = await password({
        message: 'Input Poe Server Bot Access key',
        mask: '*',
      })
      await init({
        name,
        accessKey,
        distPath,
      })
      console.log('\n✨ PoeAI server bot project create success!\n')
      console.log('Next steps:')
      console.log(`  1. ${chalk.blue(`cd ${name}`)}`)
      console.log(`  2. ${chalk.blue('pnpm install')}`)
      console.log(`  3. ${chalk.blue('pnpm dev')}`)
    }),
  )
  .version(version)
  .parse()
