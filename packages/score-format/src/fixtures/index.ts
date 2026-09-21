import meterChange from './valid/meter-change.json' with { type: 'json' }
import minimal from './valid/minimal.json' with { type: 'json' }
import pedalAcrossBar from './valid/pedal-across-bar.json' with { type: 'json' }
import pickup from './valid/pickup.json' with { type: 'json' }
import tempoChange from './valid/tempo-change.json' with { type: 'json' }
import threeLevels from './valid/three-levels.json' with { type: 'json' }
import twoVoices from './valid/two-voices.json' with { type: 'json' }

import arrangementDropsNothing from './malformed/arrangement-drops-nothing.json' with { type: 'json' }
import colourLiteral from './malformed/colour-literal.json' with { type: 'json' }
import futureVersion from './malformed/future-version.json' with { type: 'json' }
import noDuration from './malformed/no-duration.json' with { type: 'json' }
import noTitle from './malformed/no-title.json' with { type: 'json' }
import overlappingVoice from './malformed/overlapping-voice.json' with { type: 'json' }
import spellingDisagrees from './malformed/spelling-disagrees.json' with { type: 'json' }
import unknownKey from './malformed/unknown-key.json' with { type: 'json' }
import velocityZero from './malformed/velocity-zero.json' with { type: 'json' }

import v1Reference from './frozen/v1-reference.json' with { type: 'json' }

/**
 * The reference scores.
 *
 * The format will be refactored, and these are the only thing standing between
 * that refactor and a library of files that no longer open. They cover what is
 * easy to get wrong rather than what is easy: a pickup bar, a tempo change
 * mid-piece, a meter change, two voices legitimately overlapping, a pedal held
 * across a bar line, three arrangements over one source.
 *
 * Imported rather than read from disk, because this package is deliberately
 * free of node types: it runs in main, in the renderer and in the MCP server
 * alike, and learning to open a file is exactly what it must not do.
 */
export const VALID_FIXTURES = {
  minimal,
  pickup,
  'tempo-change': tempoChange,
  'meter-change': meterChange,
  'two-voices': twoVoices,
  'pedal-across-bar': pedalAcrossBar,
  'three-levels': threeLevels,
} as const

/**
 * One deliberately broken file per rule, each named for the rule it breaks.
 *
 * The value beside each is what its message must mention. A malformed fixture
 * that merely fails proves the validator said no; this proves it said why.
 */
export const MALFORMED_FIXTURES: readonly {
  readonly name: string
  readonly score: unknown
  readonly mentions: string
}[] = [
  { name: 'no-title', score: noTitle, mentions: 'title' },
  { name: 'unknown-key', score: unknownKey, mentions: 'notes' },
  { name: 'overlapping-voice', score: overlappingVoice, mentions: 'overlap' },
  { name: 'velocity-zero', score: velocityZero, mentions: 'velocity' },
  { name: 'spelling-disagrees', score: spellingDisagrees, mentions: 'spelling' },
  { name: 'no-duration', score: noDuration, mentions: 'duration' },
  { name: 'future-version', score: futureVersion, mentions: 'formatVersion' },
  { name: 'colour-literal', score: colourLiteral, mentions: 'colour' },
  { name: 'arrangement-drops-nothing', score: arrangementDropsNothing, mentions: 'ghost' },
]

/**
 * One file per historical format version, frozen.
 *
 * Never edited again. A fixture updated alongside the migration it exists to
 * test proves nothing at all, so the checksum below is what keeps that promise
 * honest rather than a comment asking nicely.
 */
export const FROZEN_FIXTURES = [
  { version: 1, name: 'v1-reference', score: v1Reference, checksum: '2e68ce7c' },
] as const

/**
 * A deterministic rendering, with object keys in sorted order.
 *
 * Round-trip comparison needs normalisation: a loader is allowed to return
 * keys in a different order than the file wrote them, and that is not a lost
 * field. Anything else changing is.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** FNV-1a over the stable rendering: small, dependency-free, and enough to detect an edit. */
export function checksum(value: unknown): string {
  const text = stableStringify(value)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
