import { z } from 'zod'

import { FORMAT_VERSION } from './version'

/**
 * The format, defined once.
 *
 * Validation has two audiences and they need identical rules. A model writing
 * a score wants a JSON Schema to read and check against; the app wants a
 * runtime validator that returns typed data and refuses bad input at the
 * border. Maintaining both by hand guarantees they drift, so the zod schema
 * here is the source and the JSON Schema is generated from it.
 *
 * What this cannot say is the musical half: a schema can require a pitch to be
 * a number, not that two of them may not sound at once in one voice. That is
 * validateScoreNotes, and parseScore runs both.
 */

const tick = z.number().int().min(0)

export const provenanceSchema = z.object({
  source: z.string().min(1),
  licence: z.string().min(1),
  attribution: z.string().optional(),
})

export const metadataSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1, 'a score needs a title'),
  composer: z.string().optional(),
  arranger: z.string().optional(),
  key: z.string().optional(),
  difficulty: z.number().min(1).max(10).optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  tags: z.array(z.string().min(1)).optional(),
  durationSeconds: z.number().min(0).optional(),
  provenance: provenanceSchema.optional(),
  generator: z.string().optional(),
})

export const tempoEventSchema = z.object({
  tick,
  microsecondsPerQuarter: z.number().int().positive(),
})

export const timeSignatureEventSchema = z.object({
  tick,
  numerator: z.number().int().positive(),
  denominator: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(4),
    z.literal(8),
    z.literal(16),
    z.literal(32),
  ]),
})

export const timingSchema = z.object({
  ticksPerQuarter: z.number().int().positive().optional(),
  tempo: z.array(tempoEventSchema).optional(),
  timeSignatures: z.array(timeSignatureEventSchema).optional(),
  pickupTicks: tick.optional(),
})

export const noteSchema = z.object({
  id: z.string().min(1).optional(),
  pitch: z.number().int().min(0).max(127),
  spelling: z
    .string()
    .regex(/^[A-G](#{1,2}|b{1,2})?(-1|\d)$/, 'a note name such as A#3 or Bb3')
    .optional(),
  start: tick,
  duration: z.number().int().positive('a note with no duration is not a note'),
  velocity: z.number().int().min(1).max(127),
  voice: z.number().int().min(0).optional(),
  hand: z.enum(['left', 'right']).optional(),
  finger: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional(),
  part: z.string().min(1).optional(),
  articulation: z.enum(['staccato', 'tenuto', 'accent', 'marcato']).optional(),
})

export const partSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  colour: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'a theme token name such as note-part-1, never a colour literal')
    .optional(),
  role: z.enum(['melody', 'accompaniment', 'bass', 'other']).optional(),
  visible: z.boolean().optional(),
})

export const pedalEventSchema = z.object({
  tick,
  pedal: z.enum(['sustain', 'sostenuto', 'softUnaCorda']),
  value: z.number().int().min(0).max(127),
})

const dynamicLevel = z.enum(['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'])

export const dynamicMarkSchema = z.object({
  tick,
  level: dynamicLevel,
  rampFrom: dynamicLevel.optional(),
  rampStart: tick.optional(),
})

export const expressionSchema = z.object({
  pedals: z.array(pedalEventSchema).optional(),
  dynamics: z.array(dynamicMarkSchema).optional(),
})

export type SectionInput = {
  id: string
  label: string
  startTick: number
  endTick: number
  children?: SectionInput[]
}

export const sectionSchema: z.ZodType<SectionInput> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string(),
    startTick: tick,
    endTick: tick,
    children: z.array(sectionSchema).optional(),
  }),
)

export const arrangementSchema = z.object({
  id: z.string().min(1),
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  label: z.string().optional(),
  parts: z.array(z.string().min(1)).optional(),
  voices: z.array(z.number().int().min(0)).optional(),
  drop: z.array(z.string().min(1)).optional(),
  tempoScale: z.number().positive().optional(),
  overrides: z.array(noteSchema.partial().extend({ id: z.string().min(1) })).optional(),
})

/**
 * Strict on purpose: a field the format does not define is an error, not
 * something to ignore. Anything else goes under extensions, which accepts
 * whatever it is given and is preserved across a round trip.
 */
export const scoreSchema = z
  .object({
    formatVersion: z.number().int().positive(),
    metadata: metadataSchema,
    timing: timingSchema.optional(),
    notes: z.array(noteSchema).optional(),
    parts: z.array(partSchema).optional(),
    expression: expressionSchema.optional(),
    sections: z.array(sectionSchema).optional(),
    arrangements: z.array(arrangementSchema).optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()

export type ScoreInput = z.infer<typeof scoreSchema>

/** What this build writes. */
export const CURRENT_FORMAT_VERSION = FORMAT_VERSION
