import { z } from 'zod'

/**
 * What a sample pack says about itself.
 *
 * The engine reads this and never builds a file name by convention: a pack
 * whose recordings are named differently, or sampled at other pitches, needs
 * a different manifest and not different code. The build script writes it and
 * checks it before writing; the app checks it again before trusting it,
 * because a pack arrives from a download and not from this repository.
 */

/** The manifest's own shape version, separate from the pack's. */
export const MANIFEST_FORMAT = 1

export const LOWEST_KEY = 21
export const HIGHEST_KEY = 108

const midiNumber = z.number().int().min(0).max(127)
const velocity = z.number().int().min(1).max(127)

export const creditSchema = z.object({
  /** The library, as its author names it. */
  title: z.string().min(1),
  author: z.string().min(1),
  /** An SPDX identifier, such as CC-BY-3.0. */
  licence: z.string().min(1),
  licenceUrl: z.string().url(),
  /** Where the recordings came from, pinned to what was fetched. */
  source: z.string().url(),
  /** The licence's full text, as a file inside the pack. */
  licenceFile: z.string().min(1),
  /** What else a credit owes: other contributors, and what this project did to the recordings. */
  notes: z.string().optional(),
})

export const packSampleSchema = z.object({
  /** Relative to the manifest. */
  file: z.string().min(1),
  /** The key the recording was made on. */
  pitch: midiNumber,
  /** The keys this recording plays, shifted from `pitch`. */
  lowKey: midiNumber,
  highKey: midiNumber,
  lowVelocity: velocity,
  highVelocity: velocity,
  /** A tuning correction to apply on top of the shift, in cents. */
  tuneCents: z.number().optional(),
  /** High strings have no damper, so a released key keeps ringing. */
  undamped: z.boolean().optional(),
  /** Length after trimming. */
  seconds: z.number().positive(),
  bytes: z.number().int().positive(),
  /** Of the file, so a download can be verified before it is decoded. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
})

export const manifestSchema = z.object({
  format: z.literal(MANIFEST_FORMAT),
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** The pack's version: a new one ships whenever the recordings or their processing change. */
  version: z.number().int().positive(),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().positive(),
  credit: creditSchema,
  samples: z.array(packSampleSchema).min(1),
})

export type Credit = z.infer<typeof creditSchema>
export type PackSample = z.infer<typeof packSampleSchema>
export type PackManifest = z.infer<typeof manifestSchema>

/**
 * What is wrong with a manifest beyond its shape.
 *
 * Every key from A0 to C8 must be playable at every velocity by exactly one
 * recording, or the engine meets a note it has nothing for, or two it has to
 * choose between, and either one is a bug in the pack rather than the player.
 */
export function manifestProblems(manifest: PackManifest): string[] {
  const problems: string[] = []

  for (const sample of manifest.samples) {
    if (sample.lowKey > sample.highKey) {
      problems.push(
        `${sample.file} covers keys ${String(sample.lowKey)} to ${String(sample.highKey)}`,
      )
    }
    if (sample.lowVelocity > sample.highVelocity) {
      problems.push(
        `${sample.file} covers velocities ${String(sample.lowVelocity)} to ${String(sample.highVelocity)}`,
      )
    }
    if (sample.pitch < sample.lowKey || sample.pitch > sample.highKey) {
      problems.push(
        `${sample.file} was recorded at ${String(sample.pitch)}, outside the keys it covers`,
      )
    }
  }

  const gaps: string[] = []
  const overlaps: string[] = []
  for (let key = LOWEST_KEY; key <= HIGHEST_KEY; key += 1) {
    for (let struck = 1; struck <= 127; struck += 1) {
      const covering = manifest.samples.filter(
        (sample) =>
          key >= sample.lowKey &&
          key <= sample.highKey &&
          struck >= sample.lowVelocity &&
          struck <= sample.highVelocity,
      )
      if (covering.length === 0) {
        gaps.push(`key ${String(key)} at velocity ${String(struck)}`)
      } else if (covering.length > 1) {
        overlaps.push(`key ${String(key)} at velocity ${String(struck)}`)
      }
    }
  }
  if (gaps.length > 0) {
    problems.push(`nothing plays ${gaps[0] ?? ''}, and ${String(gaps.length - 1)} more like it`)
  }
  if (overlaps.length > 0) {
    problems.push(
      `more than one recording plays ${overlaps[0] ?? ''}, and ${String(overlaps.length - 1)} more like it`,
    )
  }

  return problems
}

export type ManifestResult =
  | { readonly ok: true; readonly manifest: PackManifest }
  | { readonly ok: false; readonly problems: readonly string[] }

/** The one door a manifest comes through, in the build script and in the app alike. */
export function parseManifest(raw: unknown): ManifestResult {
  const parsed = manifestSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
      ),
    }
  }
  const problems = manifestProblems(parsed.data)
  return problems.length > 0 ? { ok: false, problems } : { ok: true, manifest: parsed.data }
}
