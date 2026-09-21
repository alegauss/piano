import { z } from 'zod'

import { scoreSchema } from './schema'

/**
 * The published JSON Schema document, built in one place.
 *
 * Both the generator and the freshness guard call this. Two spellings of the
 * same document is how a guard comes to compare a file against something
 * slightly other than what wrote it, and then fails for a reason nobody can
 * find.
 */
export function buildSchemaDocument(): Record<string, unknown> {
  const schema = z.toJSONSchema(scoreSchema, { target: 'draft-2020-12', io: 'input' }) as Record<
    string,
    unknown
  >

  return {
    ...schema,
    $id: 'https://alegauss.dev/piano/score.schema.json',
    title: 'Piano score',
    description:
      'A score the piano app plays. Generated from the zod schema in packages/score-format/src/schema.ts; edit that, not this.',
  }
}

/** Exactly the bytes the file holds, so a comparison is a string comparison. */
export function renderSchemaDocument(): string {
  return `${JSON.stringify(buildSchemaDocument(), null, 2)}\n`
}
