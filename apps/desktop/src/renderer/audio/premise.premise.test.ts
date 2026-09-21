import {
  barRangeToTicks,
  notesOf,
  parseScore,
  ticksToSeconds,
  timingOf,
  type Note,
  type Score,
} from '@piano/score-format'
import { describe, expect, it } from 'vitest'
import { commands } from 'vitest/browser'

import { pitchToFrequency } from './engine'
import { SynthEngine } from './synth-engine'
import { FakeTime } from './test-doubles'
import { START_LEAD_SECONDS, Transport } from './transport'

/**
 * The premise, end to end: a sentence in Claude Code makes a piano play.
 *
 * The chain runs first, for real, in Node (src/test/premise.ts): the score a
 * model wrote for the request goes through the plugin's own server to be
 * validated, saved and played, and the built app opens it and says it is
 * playing it. Then the part only a browser can do: the saved score is played
 * by the app's own transport and synthesiser into an offline context, and
 * the opening bars are listened to, note by note.
 *
 * A model's score cannot be asserted note for note, so what is asserted is
 * what must hold whoever wrote it: it validates, it is in the key and meter
 * the request named, it has a sane number of notes, it begins with the tune
 * that was asked for, and every note of its opening sounds at its own pitch at
 * the moment the score puts it.
 */

type Answer = {
  readonly tool: string
  readonly ok: boolean
  readonly text: string
  readonly data: unknown
}
type PremiseRun = {
  readonly request: string
  readonly answers: readonly Answer[]
  readonly saved: unknown
}

declare module 'vitest/browser' {
  interface BrowserCommands {
    premiseRun: () => Promise<PremiseRun>
  }
}

const RATE = 22_050
const OPENING_BARS = 2

/** Ode to Joy opens E E F G, G F E D: as pitch classes, whatever octave it was written in. */
const OPENING_TUNE = [4, 4, 5, 7, 7, 5, 4, 2]

/** How strongly one frequency sounds between two times: a single-bin Goertzel filter. */
function power(data: Float32Array, frequency: number, from: number, to: number): number {
  const start = Math.round(from * RATE)
  const end = Math.round(to * RATE)
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / RATE)
  let previous = 0
  let before = 0
  for (let index = start; index < end; index += 1) {
    const current = (data[index] ?? 0) + coefficient * previous - before
    before = previous
    previous = current
  }
  const count = Math.max(1, end - start)
  return (previous * previous + before * before - coefficient * previous * before) / count ** 2
}

function loudness(data: Float32Array, from: number, to: number): number {
  let sum = 0
  const start = Math.round(from * RATE)
  const end = Math.round(to * RATE)
  for (let index = start; index < end; index += 1) {
    sum += (data[index] ?? 0) ** 2
  }
  return Math.sqrt(sum / Math.max(1, end - start))
}

/** The highest note struck at each moment, which is the tune somebody hears. */
function topLine(notes: readonly Note[], until: number): Note[] {
  const byStart = new Map<number, Note>()
  for (const note of notes) {
    const held = byStart.get(note.start)
    if (note.start < until && (held === undefined || note.pitch > held.pitch)) {
      byStart.set(note.start, note)
    }
  }
  return [...byStart.values()].sort((one, other) => one.start - other.start)
}

/** Play a score the way the window does — its transport, its synthesiser — into an offline context. */
async function hear(score: Score, seconds: number): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, Math.round(seconds * RATE), RATE)
  const time = new FakeTime()
  const transport = new Transport(new SynthEngine(context), time.clock, time.ticker)
  transport.load({ timing: timingOf(score), notes: notesOf(score) })
  transport.play()
  time.run(seconds)
  return (await context.startRendering()).getChannelData(0)
}

function answer(run: PremiseRun, tool: string): Answer {
  const found = run.answers.find((one) => one.tool === tool)
  if (found === undefined) {
    throw new Error(`${tool} was never called: ${JSON.stringify(run.answers)}`)
  }
  return found
}

describe('a sentence in Claude Code makes a piano play', () => {
  it('goes from a request to the piece sounding in the window', async () => {
    const run = await commands.premiseRun()

    // The chain: checked, kept, opened in the window and playing there.
    expect(answer(run, 'validate_score')).toMatchObject({ ok: true })
    expect(answer(run, 'save_score')).toMatchObject({ ok: true })
    const played = answer(run, 'play')
    expect(played.ok, played.text).toBe(true)
    expect(played.text).toContain('Opened')
    const parsed = parseScore(run.saved)
    if (!parsed.ok) {
      throw new Error(`the library holds a score the format refuses: ${parsed.message}`)
    }
    const score = parsed.score
    expect(answer(run, 'piano_state').data).toMatchObject({
      score: score.metadata.title,
      status: 'playing',
    })

    // What must hold whoever wrote it.
    const timing = timingOf(score)
    expect(score.metadata.key?.toLowerCase()).toBe('c major')
    expect(timing.timeSignatures[0]).toMatchObject({ numerator: 4, denominator: 4 })
    const notes = notesOf(score)
    expect(notes.length).toBeGreaterThanOrEqual(16)
    expect(notes.length).toBeLessThanOrEqual(400)
    const opening = barRangeToTicks(timing, 1, OPENING_BARS)
    const tune = topLine(notes, opening.end)
    expect(tune.map((note) => note.pitch % 12)).toEqual(OPENING_TUNE)

    // And it plays: silence until the first note, then each note of the tune
    // sounding at its own pitch when the score says, above every other pitch
    // the tune uses.
    const at = (tick: number) => START_LEAD_SECONDS + ticksToSeconds(timing, tick)
    const seconds = at(opening.end) + 0.5
    const data = await hear(score, seconds)
    expect(loudness(data, 0, at(0) - 0.01)).toBeLessThan(1e-4)
    expect(loudness(data, at(0) + 0.05, at(opening.end))).toBeGreaterThan(0.01)

    const pitches = [...new Set(tune.map((note) => note.pitch))]
    for (const note of tune) {
      const from = at(note.start) + 0.08
      const to = Math.min(at(note.start + note.duration) - 0.03, at(note.start) + 0.4)
      const strongest = pitches
        .map((pitch) => ({ pitch, power: power(data, pitchToFrequency(pitch), from, to) }))
        .sort((one, other) => other.power - one.power)[0]
      expect(strongest?.pitch, `the note at tick ${String(note.start)}`).toBe(note.pitch)
    }
  })
})
