import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { renderSchemaDocument } from '../src/schema-document.ts'

/**
 * Write the JSON Schema from the zod schema.
 *
 * One source of truth: the document a model reads and the validator the app
 * runs come from the same declaration, so they cannot drift.
 * scripts/check-schema-fresh.mts is what makes that a fact rather than a hope.
 */
const outDir = fileURLToPath(new URL('../schema/', import.meta.url))
await mkdir(outDir, { recursive: true })
await writeFile(
  fileURLToPath(new URL('../schema/score.schema.json', import.meta.url)),
  renderSchemaDocument(),
  'utf8',
)

process.stdout.write('schema: wrote packages/score-format/schema/score.schema.json\n')
