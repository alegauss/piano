import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'
import { build as viteBuild } from 'vite'

import { esbuildOptions } from './esbuild.options.mjs'

const viteConfigFile = fileURLToPath(new URL('../vite.config.mts', import.meta.url))

await Promise.all(esbuildOptions(false).map((options) => build(options)))
await viteBuild({ configFile: viteConfigFile })

process.stdout.write('piano: build complete\n')
