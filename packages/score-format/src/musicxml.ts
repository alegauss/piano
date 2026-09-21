/**
 * MusicXML in, on the tick grid the format was built on.
 *
 * This is the import MIDI cannot be. A MIDI file states pitches and times and
 * leaves the rest to be guessed: importMidi splits hands at middle C, spells
 * every black key as a sharp and refuses to invent fingering at all. MusicXML
 * writes all three down, and the score format has had a field for each of them
 * since it was designed, so the mapping is mostly a matter of not throwing
 * anything away.
 *
 * One direction only, on purpose. Writing MusicXML would mean deciding beams,
 * stems, rests and a page, which is the staff notation editor the roadmap says
 * this is not; MIDI remains the way out.
 *
 * What cannot survive is reported rather than dropped in silence, the same way
 * importMidi reports it: `dropped` for what the file carried and a score has
 * nowhere to put, `inferred` for what this code decided on the file's behalf.
 * Provenance is left empty however much the file says about its own rights,
 * because a licence is recorded by a person.
 */

import {
  type Articulation,
  type DynamicLevel,
  type DynamicMark,
  type PedalEvent,
  type PedalKind,
} from './expression'
import { keyNameOf } from './metadata'
import {
  attributeNumber,
  child,
  childNumber,
  childText,
  children,
  MusicXmlError,
  parseXml,
  type XmlElement,
} from './musicxml-file'
import { voiceOf, type Finger, type Hand, type Note } from './note'
import { parseScore } from './parse'
import { type Part } from './part'
import { type Score } from './score'
import { DEFAULT_TICKS_PER_QUARTER, type TempoEvent, type TimeSignatureEvent } from './time'
import { FORMAT_VERSION } from './version'

/**
 * Where an imported score records what it guessed, so a later reader can tell
 * a hand the file stated from one this code made up.
 */
export const MUSICXML_IMPORT_EXTENSION = 'piano.musicxml-import'

export type MusicXmlImportOptions = {
  /**
   * What to call the piece where the document does not say.
   *
   * The fallback rather than the override, which is the opposite way round
   * from the MIDI importer: a MIDI sequence name is a track label and a file
   * name usually beats it, where MusicXML has a field whose whole purpose is
   * the title of the work.
   */
  readonly title?: string
}

export type MusicXmlImport =
  | {
      readonly ok: true
      readonly score: Score
      /** What the file carried that the score has nowhere to put, one sentence each. */
      readonly dropped: readonly string[]
      /** What the score now says that the file did not, and how it was guessed. */
      readonly inferred: readonly string[]
    }
  | { readonly ok: false; readonly message: string }

/** Where a note with no staff and no clef to go by is split: middle C and above to the right. */
const MIDDLE_C = 60

/**
 * What every note is written at.
 *
 * MusicXML states loudness as marks over a span rather than per note, so a
 * velocity here would be this code's invention. Dynamics scale it, which is
 * what the expression half of the format is for.
 */
const DEFAULT_VELOCITY = 80

/** The velocity MusicXML's own per-note `dynamics` percentage is a percentage of. */
const FORTE_VELOCITY = 90

/**
 * The finest grid an import will build.
 *
 * Divisions are per part and may differ, so the grid is their least common
 * multiple; a file combining several unusual ones could otherwise ask for a
 * grid no playback clock benefits from.
 */
const MAX_TICKS_PER_QUARTER = 15_360

/** A repeat structure that never lands anywhere is a broken file, not a long piece. */
const MAX_PLAYED_MEASURES = 4_000

const MICROSECONDS_PER_MINUTE = 60_000_000

const STEP_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

/** What MusicXML calls an articulation, as the four this format keeps. */
const ARTICULATIONS: Readonly<Record<string, Articulation>> = {
  staccato: 'staccato',
  staccatissimo: 'staccato',
  tenuto: 'tenuto',
  'detached-legato': 'tenuto',
  accent: 'accent',
  'strong-accent': 'marcato',
}

/** The dynamic marks that name a level outright. An sf or an fp is an event, not a level. */
const DYNAMICS: Readonly<Record<string, DynamicLevel>> = {
  pppp: 'ppp',
  ppp: 'ppp',
  pp: 'pp',
  p: 'p',
  mp: 'mp',
  mf: 'mf',
  f: 'f',
  ff: 'ff',
  fff: 'fff',
  ffff: 'fff',
}

/** How long a metronome's beat unit is, counted in quarters. */
const BEAT_UNITS: Readonly<Record<string, number>> = {
  breve: 8,
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125,
}

/** The beat a time signature may be counted in, which is what the format stores. */
const DENOMINATORS = new Set([1, 2, 4, 8, 16, 32])

function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b)
}

/** A note under construction, before ties are joined and voices settled. */
type Sounding = { -readonly [K in keyof Note]: Note[K] }

// ---------------------------------------------------------------------------
// What one measure of one part holds, in ticks from the start of that measure
// ---------------------------------------------------------------------------

type ReadNote = {
  readonly start: number
  readonly duration: number
  readonly pitch: number
  readonly spelling: string | undefined
  readonly staff: number
  readonly voice: string
  readonly finger: Finger | undefined
  readonly articulation: Articulation | undefined
  readonly velocity: number
  readonly tieStart: boolean
  readonly tieStop: boolean
}

type PedalMark = { readonly tick: number; readonly pedal: PedalKind; readonly value: number }
type LevelMark = { readonly tick: number; readonly level: DynamicLevel }
type Wedge = { readonly tick: number; readonly stop: boolean }
type KeyMark = { readonly tick: number; readonly name: string }

type Reading = {
  /** How long the measure is for this part, which is how far its cursor reached. */
  readonly length: number
  readonly notes: readonly ReadNote[]
  /** The clefs in force by the end of this measure, so a change mid-piece is followed. */
  readonly clefs: ReadonlyMap<number, string>
  readonly pedals: readonly PedalMark[]
  readonly dynamics: readonly LevelMark[]
  readonly wedges: readonly Wedge[]
  readonly tempos: readonly TempoEvent[]
  readonly meters: readonly TimeSignatureEvent[]
  readonly keys: readonly KeyMark[]
}

/** Everything the file held that a score cannot, counted rather than listed. */
type Leftovers = {
  graceNotes: number
  cueNotes: number
  unpitched: number
  lyrics: number
  words: number
  ornaments: number
  slurs: number
  otherArticulations: number
  otherDynamics: number
  oddMeters: number
  transposed: number
  readonly jumps: Set<string>
  readonly rights: Set<string>
}

function emptyLeftovers(): Leftovers {
  return {
    graceNotes: 0,
    cueNotes: 0,
    unpitched: 0,
    lyrics: 0,
    words: 0,
    ornaments: 0,
    slurs: 0,
    otherArticulations: 0,
    otherDynamics: 0,
    oddMeters: 0,
    transposed: 0,
    jumps: new Set(),
    rights: new Set(),
  }
}

function describeLeftovers(leftovers: Leftovers, keyChanges: number): string[] {
  const dropped: string[] = []
  const add = (count: number, sentence: string): void => {
    if (count > 0) {
      dropped.push(sentence)
    }
  }

  add(
    leftovers.graceNotes,
    `${counted(leftovers.graceNotes, 'grace note', 'grace notes')}, which are written with no length of their own`,
  )
  add(
    leftovers.cueNotes,
    `${counted(leftovers.cueNotes, 'cue note', 'cue notes')}, which are printed rather than played`,
  )
  add(
    leftovers.unpitched,
    `${counted(leftovers.unpitched, 'unpitched note', 'unpitched notes')}; this app plays one piano`,
  )
  add(leftovers.lyrics, counted(leftovers.lyrics, 'lyric', 'lyrics'))
  add(
    leftovers.words,
    `${counted(leftovers.words, 'written direction', 'written directions')}, such as a tempo word or a rehearsal mark`,
  )
  add(
    leftovers.ornaments,
    `${counted(leftovers.ornaments, 'ornament', 'ornaments')}; a trill sounds as the note it is written on`,
  )
  add(
    leftovers.slurs,
    `${counted(leftovers.slurs, 'slur', 'slurs')}; phrasing is not stored per note`,
  )
  add(
    leftovers.otherArticulations,
    `${counted(leftovers.otherArticulations, 'articulation', 'articulations')} other than staccato, tenuto, accent and marcato`,
  )
  add(
    leftovers.otherDynamics,
    `${counted(leftovers.otherDynamics, 'dynamic mark', 'dynamic marks')} such as sf or fp, which name an event rather than a level`,
  )
  for (const jump of [...leftovers.jumps].sort()) {
    dropped.push(`the ${jump} direction, which a reader follows and this import does not`)
  }
  add(
    leftovers.oddMeters,
    `${counted(leftovers.oddMeters, 'time signature', 'time signatures')} counted in a beat the format does not store`,
  )
  add(
    leftovers.transposed,
    `${counted(leftovers.transposed, 'transposition', 'transpositions')}; the notes are kept at the pitch they sound`,
  )
  add(
    keyChanges,
    `${counted(keyChanges, 'key change', 'key changes')}; a score names one key, and the notes stay the truth`,
  )
  for (const notice of [...leftovers.rights].sort()) {
    dropped.push(`the rights notice "${notice}"; a score's licence is recorded by a person`)
  }

  return dropped
}

// ---------------------------------------------------------------------------
// Reading one measure
// ---------------------------------------------------------------------------

/** What carries from one measure of a part to the next, as the file writes it linearly. */
type PartState = {
  divisions: number
  /** The sign of each staff's clef, which is how a one-staff part finds its hand. */
  readonly clefs: Map<number, string>
}

function fingerOf(text: string | undefined): Finger | undefined {
  const digit = text === undefined ? null : /[1-5]/.exec(text)
  return digit === null ? undefined : (Number(digit[0]) as Finger)
}

/** The pitch a `<pitch>` names and, where this format can spell it, how it is written. */
function pitchOf(pitch: XmlElement): { pitch: number; spelling: string | undefined } | null {
  const step = childText(pitch, 'step')?.toUpperCase()
  const octave = childNumber(pitch, 'octave')
  const semitone = step === undefined ? undefined : STEP_SEMITONES[step]
  if (semitone === undefined || octave === undefined || !Number.isInteger(octave)) {
    return null
  }
  const alter = childNumber(pitch, 'alter') ?? 0
  const midi = (octave + 1) * 12 + semitone + Math.round(alter)
  if (midi < 0 || midi > 127) {
    return null
  }
  // Only what the spelling field accepts: at most two of one accidental, and
  // an octave the notation names. A quarter tone sounds and stays unspelled.
  const spellable = Number.isInteger(alter) && Math.abs(alter) <= 2 && octave >= -1 && octave <= 9
  const accidental = alter > 0 ? '#'.repeat(alter) : 'b'.repeat(-alter)
  return {
    pitch: midi,
    spelling: spellable ? `${step}${accidental}${String(octave)}` : undefined,
  }
}

function readNotations(
  note: XmlElement,
  leftovers: Leftovers,
): { finger: Finger | undefined; articulation: Articulation | undefined } {
  let finger: Finger | undefined
  let articulation: Articulation | undefined

  for (const notations of children(note, 'notations')) {
    for (const group of notations.children) {
      if (group.name === 'technical') {
        finger ??= fingerOf(childText(group, 'fingering'))
      } else if (group.name === 'articulations') {
        for (const mark of group.children) {
          const known = ARTICULATIONS[mark.name]
          if (known === undefined) {
            leftovers.otherArticulations += 1
          } else {
            articulation ??= known
          }
        }
      } else if (group.name === 'ornaments') {
        leftovers.ornaments += Math.max(1, group.children.length)
      } else if (group.name === 'slur' && group.attributes['type'] === 'start') {
        leftovers.slurs += 1
      }
    }
  }

  return { finger, articulation }
}

/** Where a direction's marks are collected while one measure is read. */
type Marks = {
  readonly pedals: PedalMark[]
  readonly dynamics: LevelMark[]
  readonly wedges: Wedge[]
  readonly tempos: TempoEvent[]
}

function readDirection(
  direction: XmlElement,
  tick: number,
  marks: Marks,
  leftovers: Leftovers,
): void {
  for (const type of children(direction, 'direction-type')) {
    for (const mark of type.children) {
      switch (mark.name) {
        case 'dynamics':
          for (const level of mark.children) {
            const known = DYNAMICS[level.name]
            if (known === undefined) {
              leftovers.otherDynamics += 1
            } else {
              marks.dynamics.push({ tick, level: known })
            }
          }
          break

        case 'wedge': {
          const kind = mark.attributes['type']
          if (kind === 'crescendo' || kind === 'diminuendo') {
            marks.wedges.push({ tick, stop: false })
          } else if (kind === 'stop') {
            marks.wedges.push({ tick, stop: true })
          }
          break
        }

        case 'pedal': {
          const kind = mark.attributes['type']
          if (kind === 'start' || kind === 'resume') {
            marks.pedals.push({ tick, pedal: 'sustain', value: 127 })
          } else if (kind === 'stop' || kind === 'discontinue') {
            marks.pedals.push({ tick, pedal: 'sustain', value: 0 })
          } else if (kind === 'change') {
            // A re-pedal: up and straight back down, which is what two events
            // at one tick say when they are read in the order they were written.
            marks.pedals.push({ tick, pedal: 'sustain', value: 0 })
            marks.pedals.push({ tick, pedal: 'sustain', value: 127 })
          } else if (kind === 'sostenuto') {
            marks.pedals.push({ tick, pedal: 'sostenuto', value: 127 })
          }
          break
        }

        case 'metronome': {
          const unit = BEAT_UNITS[childText(mark, 'beat-unit') ?? '']
          const perMinute = childNumber(mark, 'per-minute')
          if (unit !== undefined && perMinute !== undefined && perMinute > 0) {
            const dotted = child(mark, 'beat-unit-dot') === undefined ? 1 : 1.5
            marks.tempos.push({
              tick,
              microsecondsPerQuarter: Math.round(
                MICROSECONDS_PER_MINUTE / (perMinute * unit * dotted),
              ),
            })
          }
          break
        }

        case 'words':
        case 'rehearsal':
          leftovers.words += 1
          break

        default:
          break
      }
    }
  }
}

/** The tempo and the pedal a `<sound>` states, wherever it sits. */
function readSound(sound: XmlElement, tick: number, marks: Marks, leftovers: Leftovers): void {
  const tempo = attributeNumber(sound, 'tempo')
  if (tempo !== undefined && tempo > 0) {
    marks.tempos.push({
      tick,
      microsecondsPerQuarter: Math.round(MICROSECONDS_PER_MINUTE / tempo),
    })
  }

  const pedal = sound.attributes['pedal']
  if (pedal === 'yes') {
    marks.pedals.push({ tick, pedal: 'sustain', value: 127 })
  } else if (pedal === 'no') {
    marks.pedals.push({ tick, pedal: 'sustain', value: 0 })
  }

  const JUMPS: Readonly<Record<string, string>> = {
    dacapo: 'da capo',
    dalsegno: 'dal segno',
    tocoda: 'to coda',
    fine: 'fine',
  }
  for (const [attribute, name] of Object.entries(JUMPS)) {
    if (sound.attributes[attribute] !== undefined) {
      leftovers.jumps.add(name)
    }
  }
}

function readAttributes(
  attributes: XmlElement,
  cursor: number,
  state: PartState,
  found: { readonly meters: TimeSignatureEvent[]; readonly keys: KeyMark[] },
  leftovers: Leftovers,
): void {
  const divisions = childNumber(attributes, 'divisions')
  if (divisions !== undefined && divisions > 0) {
    state.divisions = divisions
  }

  for (const clef of children(attributes, 'clef')) {
    const sign = childText(clef, 'sign')
    if (sign !== undefined) {
      state.clefs.set(attributeNumber(clef, 'number') ?? 1, sign)
    }
  }

  for (const key of children(attributes, 'key')) {
    const fifths = childNumber(key, 'fifths')
    const name =
      fifths === undefined || Math.abs(fifths) > 7
        ? null
        : keyNameOf(Math.round(fifths), childText(key, 'mode')?.toLowerCase() === 'minor')
    if (name !== null) {
      found.keys.push({ tick: cursor, name })
    }
  }

  for (const time of children(attributes, 'time')) {
    const numerator = childNumber(time, 'beats')
    const denominator = childNumber(time, 'beat-type')
    if (numerator === undefined || denominator === undefined) {
      continue
    }
    if (!DENOMINATORS.has(denominator) || !Number.isInteger(numerator) || numerator < 1) {
      leftovers.oddMeters += 1
      continue
    }
    found.meters.push({ tick: cursor, numerator, denominator })
  }

  if (child(attributes, 'transpose') !== undefined) {
    leftovers.transposed += 1
  }
}

/**
 * One measure of one part, in ticks from the start of that measure.
 *
 * The cursor is what MusicXML calls the current position: a note advances it
 * unless it is a chord tone, a rest advances it without sounding, and backup
 * and forward move it by hand, which is how two voices share one measure.
 */
function readMeasure(
  measure: XmlElement,
  state: PartState,
  ticksPerQuarter: number,
  leftovers: Leftovers,
): Reading {
  const notes: ReadNote[] = []
  const marks: Marks = { pedals: [], dynamics: [], wedges: [], tempos: [] }
  const found = { meters: [] as TimeSignatureEvent[], keys: [] as KeyMark[] }

  let cursor = 0
  let furthest = 0
  let previousStart = 0

  const ticksOf = (durations: number): number =>
    Math.round((durations * ticksPerQuarter) / state.divisions)

  for (const element of measure.children) {
    switch (element.name) {
      case 'attributes':
        readAttributes(element, cursor, state, found, leftovers)
        break

      case 'note': {
        if (child(element, 'grace') !== undefined) {
          leftovers.graceNotes += 1
          break
        }
        if (child(element, 'cue') !== undefined) {
          leftovers.cueNotes += 1
          break
        }

        const isChord = child(element, 'chord') !== undefined
        const duration = ticksOf(Math.max(0, childNumber(element, 'duration') ?? 0))
        const start = isChord ? previousStart : cursor
        if (!isChord) {
          cursor += duration
          furthest = Math.max(furthest, cursor)
        }
        previousStart = start

        if (child(element, 'rest') !== undefined) {
          break
        }
        if (child(element, 'unpitched') !== undefined) {
          leftovers.unpitched += 1
          break
        }
        leftovers.lyrics += children(element, 'lyric').length

        const pitch = child(element, 'pitch')
        const heard = pitch === undefined ? null : pitchOf(pitch)
        if (heard === null || duration <= 0) {
          break
        }

        const { finger, articulation } = readNotations(element, leftovers)
        const loudness = attributeNumber(element, 'dynamics')
        const ties = children(element, 'tie').map((tie) => tie.attributes['type'])
        notes.push({
          start,
          duration,
          pitch: heard.pitch,
          spelling: heard.spelling,
          staff: childNumber(element, 'staff') ?? 1,
          voice: childText(element, 'voice') ?? '1',
          finger,
          articulation,
          velocity:
            loudness === undefined
              ? DEFAULT_VELOCITY
              : Math.min(127, Math.max(1, Math.round((FORTE_VELOCITY * loudness) / 100))),
          tieStart: ties.includes('start'),
          tieStop: ties.includes('stop'),
        })
        break
      }

      case 'backup':
        cursor = Math.max(0, cursor - ticksOf(childNumber(element, 'duration') ?? 0))
        previousStart = cursor
        break

      case 'forward':
        cursor += ticksOf(childNumber(element, 'duration') ?? 0)
        previousStart = cursor
        furthest = Math.max(furthest, cursor)
        break

      case 'direction': {
        const tick = Math.max(0, cursor + ticksOf(childNumber(element, 'offset') ?? 0))
        readDirection(element, tick, marks, leftovers)
        const sound = child(element, 'sound')
        if (sound !== undefined) {
          readSound(sound, tick, marks, leftovers)
        }
        break
      }

      case 'sound':
        readSound(element, cursor, marks, leftovers)
        break

      default:
        break
    }
  }

  return {
    length: furthest,
    notes,
    clefs: new Map(state.clefs),
    pedals: marks.pedals,
    dynamics: marks.dynamics,
    wedges: marks.wedges,
    tempos: marks.tempos,
    meters: found.meters,
    keys: found.keys,
  }
}

// ---------------------------------------------------------------------------
// Repeats
// ---------------------------------------------------------------------------

type MeasurePlan = {
  forward: boolean
  backward: number | null
  endings: readonly number[] | null
  endingEnds: boolean
}

function emptyPlan(): MeasurePlan {
  return { forward: false, backward: null, endings: null, endingEnds: false }
}

/** The passes an ending answers to, out of the "1, 2" its number attribute holds. */
function endingNumbers(text: string | undefined): number[] {
  return (text ?? '')
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

/**
 * What every part's barlines say about each measure, merged.
 *
 * Merged because a repeat belongs to the piece and not to a staff, and an
 * engraver may well have written the barline on one part only.
 */
function readPlans(parts: readonly PartSource[], measureCount: number): MeasurePlan[] {
  const plans = Array.from({ length: measureCount }, emptyPlan)

  for (const part of parts) {
    part.measures.forEach((measure, index) => {
      const plan = plans[index]
      if (plan === undefined) {
        return
      }
      for (const barline of children(measure, 'barline')) {
        const repeat = child(barline, 'repeat')
        const direction = repeat?.attributes['direction']
        if (direction === 'forward') {
          plan.forward = true
        } else if (direction === 'backward') {
          const times = attributeNumber(repeat, 'times')
          plan.backward = Math.max(plan.backward ?? 2, times !== undefined && times > 1 ? times : 2)
        }

        const ending = child(barline, 'ending')
        const kind = ending?.attributes['type']
        if (kind === 'start') {
          plan.endings = [...(plan.endings ?? []), ...endingNumbers(ending?.attributes['number'])]
        } else if (kind === 'stop' || kind === 'discontinue') {
          plan.endingEnds = true
        }
      }
    })
  }

  return plans
}

/**
 * Which measures are played, in order, with repeats taken.
 *
 * Expanded rather than kept as structure: playback and the falling notes both
 * want real time, and a roll that drew a repeat as a marker would have to
 * expand it before anything sounded anyway.
 */
function playOrder(plans: readonly MeasurePlan[]): { order: number[]; expanded: boolean } {
  const order: number[] = []
  const played = new Map<number, number>()
  let start = 0
  let pass = 1
  let index = 0
  let expanded = false
  /** Whether this measure was reached by a repeat, which is what counts a pass. */
  let jumped = false

  while (index >= 0 && index < plans.length && order.length < MAX_PLAYED_MEASURES) {
    const plan = plans[index] ?? emptyPlan()

    if (plan.forward) {
      start = index
      // Falling into a repeat starts it over; landing on it from its own
      // backward barline is the pass that was just counted.
      if (!jumped) {
        pass = 1
      }
    }
    jumped = false

    if (plan.endings !== null && !plan.endings.includes(pass)) {
      let skip = index
      while (skip < plans.length && !(plans[skip]?.endingEnds ?? true)) {
        skip += 1
      }
      index = skip + 1
      expanded = true
      continue
    }

    order.push(index)

    if (plan.backward !== null) {
      const times = played.get(index) ?? 1
      if (times < plan.backward) {
        played.set(index, times + 1)
        pass = times + 1
        index = start
        jumped = true
        expanded = true
        continue
      }
      // Cleared, so a repeat sitting inside a larger one plays in full next time round.
      played.delete(index)
      pass = 1
    }

    index += 1
  }

  return { order, expanded }
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

type PartSource = {
  readonly id: string
  readonly name: string
  readonly measures: readonly XmlElement[]
}

/** The parts and their measures, whichever of the two axes the document put outermost. */
function readParts(root: XmlElement): PartSource[] {
  const names = new Map<string, string>()
  for (const scorePart of children(child(root, 'part-list'), 'score-part')) {
    const id = scorePart.attributes['id']
    if (id !== undefined) {
      names.set(id, childText(scorePart, 'part-name') ?? '')
    }
  }

  const named = (id: string, index: number): string => {
    const stated = names.get(id)
    return stated === undefined || stated === '' ? `Part ${String(index + 1)}` : stated
  }

  if (root.name === 'score-partwise') {
    return children(root, 'part').map((part, index) => {
      const id = part.attributes['id'] ?? `P${String(index + 1)}`
      return { id, name: named(id, index), measures: children(part, 'measure') }
    })
  }

  // Timewise: measures outermost, each holding every part. A timewise <part>
  // holds what a partwise <measure> does, so swapping the axes is all it takes
  // for everything downstream to see one shape.
  const byPart = new Map<string, XmlElement[]>()
  for (const measure of children(root, 'measure')) {
    for (const part of children(measure, 'part')) {
      const id = part.attributes['id'] ?? 'P1'
      const held = byPart.get(id)
      if (held === undefined) {
        byPart.set(id, [part])
      } else {
        held.push(part)
      }
    }
  }
  return [...byPart.entries()].map(([id, measures], index) => ({
    id,
    name: named(id, index),
    measures,
  }))
}

/** The grid every part's divisions land on exactly, or the finest one worth building. */
function readGrid(parts: readonly PartSource[], inferred: Record<string, string>): number {
  const stated = new Set<number>()
  for (const part of parts) {
    for (const measure of part.measures) {
      for (const attributes of children(measure, 'attributes')) {
        const divisions = childNumber(attributes, 'divisions')
        if (divisions !== undefined && Number.isInteger(divisions) && divisions > 0) {
          stated.add(divisions)
        }
      }
    }
  }
  if (stated.size === 0) {
    return DEFAULT_TICKS_PER_QUARTER
  }

  let grid = 1
  for (const divisions of stated) {
    grid = (grid / greatestCommonDivisor(grid, divisions)) * divisions
    if (grid > MAX_TICKS_PER_QUARTER) {
      inferred['grid'] =
        `the file counts a quarter note in ${counted(stated.size, 'way', 'different ways')}, so notes were rounded onto a grid of ${String(MAX_TICKS_PER_QUARTER)} ticks`
      return MAX_TICKS_PER_QUARTER
    }
  }
  return grid
}

/** Which hand plays a staff, and whether the file is what said so. */
function handOfStaff(
  staff: number,
  clefs: ReadonlyMap<number, string>,
  staves: number,
  pitch: number,
): { hand: Hand; stated: boolean } {
  if (staves > 1) {
    return { hand: staff > 1 ? 'left' : 'right', stated: true }
  }
  const sign = clefs.get(staff) ?? clefs.get(1)
  if (sign === 'F') {
    return { hand: 'left', stated: true }
  }
  if (sign === 'G') {
    return { hand: 'right', stated: true }
  }
  return { hand: pitch >= MIDDLE_C ? 'right' : 'left', stated: false }
}

/**
 * One voice may not strike a key that is still sounding, so a note that does
 * gets the lowest voice free on that key. The file's own voice is kept
 * wherever it can be: it is the composer's line, not this code's bookkeeping.
 */
function resolveVoices(notes: readonly Note[], inferred: Record<string, string>): Note[] {
  const soundingUntil = new Map<number, number[]>()
  let moved = 0

  const voiced = notes.map((note) => {
    const ends = soundingUntil.get(note.pitch) ?? []
    soundingUntil.set(note.pitch, ends)
    const wanted = voiceOf(note)
    let voice = wanted
    if ((ends[wanted] ?? 0) > note.start) {
      voice = ends.findIndex((until) => (until ?? 0) <= note.start)
      if (voice === -1) {
        voice = ends.length
      }
      moved += 1
    }
    ends[voice] = note.start + note.duration
    return voice === wanted ? note : { ...note, voice }
  })

  if (moved > 0) {
    const own = moved === 1 ? 'its' : 'their'
    inferred['voice'] =
      `${counted(moved, 'note', 'notes')} struck on a key already sounding in the same voice got a voice of ${own} own`
  }
  return voiced
}

/** Ties joined: the second note of a tie is the first one lasting longer. */
function joinTies(
  sounding: readonly (Sounding & { tieStart: boolean; tieStop: boolean })[],
  inferred: Record<string, string>,
): Note[] {
  const open = new Map<string, Sounding>()
  const kept: Sounding[] = []
  let joined = 0

  for (const note of sounding) {
    const key = `${String(note.pitch)}:${String(note.voice ?? 0)}:${note.part ?? ''}`
    const held = open.get(key)
    const { tieStart, tieStop, ...rest } = note

    if (tieStop && held !== undefined && held.start + held.duration <= note.start) {
      held.duration = note.start + note.duration - held.start
      joined += 1
      if (!tieStart) {
        open.delete(key)
      }
      continue
    }

    kept.push(rest)
    if (tieStart) {
      open.set(key, rest)
    } else {
      open.delete(key)
    }
  }

  if (joined > 0) {
    inferred['tie'] =
      `${counted(joined, 'tied note', 'tied notes')} became the note before it lasting longer, which is what a tie means to a key`
  }
  return kept
}

/** Crescendos, as the ramp between the level before a wedge and the one after it. */
function rampDynamics(marks: readonly LevelMark[], wedges: readonly Wedge[]): DynamicMark[] {
  const sorted = [...marks].sort((a, b) => a.tick - b.tick)
  const opened = wedges.filter((wedge) => !wedge.stop).map((wedge) => wedge.tick)

  return sorted.map((mark, index) => {
    const previous = sorted[index - 1]
    if (previous === undefined || previous.level === mark.level) {
      return { tick: mark.tick, level: mark.level }
    }
    // The wedge this mark ends: one opened after the mark before it and before
    // this one. Anything else is a hairpin that changed nothing.
    const wedge = opened.find((tick) => tick >= previous.tick && tick < mark.tick)
    return wedge === undefined
      ? { tick: mark.tick, level: mark.level }
      : { tick: mark.tick, level: mark.level, rampFrom: previous.level, rampStart: wedge }
  })
}

/** Neighbours saying the same thing, which is what expanding a repeat produces. */
function withoutRepeats<A extends { readonly tick: number }>(
  events: readonly A[],
  same: (a: A, b: A) => boolean,
): A[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick)
  return sorted.filter((event, index) => {
    const previous = sorted[index - 1]
    return previous === undefined || !same(previous, event)
  })
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Read a MusicXML document into a score.
 *
 * Takes the text: a .mxl is unwrapped by musicXmlText first, which is where
 * the zip container and the host's inflate live. Repeats are expanded, ties
 * joined, and hands read from the staff a note is written on rather than
 * guessed from its pitch — with whatever guessing was still necessary listed
 * in `inferred` and recorded under the score's extensions. The score is
 * validated before it is returned, so a successful import is a file the app
 * opens.
 */
export function importMusicXml(xml: string, options: MusicXmlImportOptions = {}): MusicXmlImport {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (error) {
    if (error instanceof MusicXmlError) {
      return { ok: false, message: error.message }
    }
    throw error
  }

  if (root.name !== 'score-partwise' && root.name !== 'score-timewise') {
    return {
      ok: false,
      message: `this is XML but not MusicXML: it opens with <${root.name}> where <score-partwise> belongs`,
    }
  }

  const sources = readParts(root)
  if (sources.length === 0 || sources.every((part) => part.measures.length === 0)) {
    return { ok: false, message: 'this MusicXML document holds no music: it has no measures' }
  }

  const inferred: Record<string, string> = {}
  const leftovers = emptyLeftovers()
  const ticksPerQuarter = readGrid(sources, inferred)

  // Read in the order the file writes it, because divisions and clefs carry
  // forward: a repeat replays a measure, never the attributes before it.
  const staves = sources.map(() => 1)
  const readings = sources.map((part, index) => {
    const state: PartState = { divisions: 1, clefs: new Map() }
    return part.measures.map((measure) => {
      const reading = readMeasure(measure, state, ticksPerQuarter, leftovers)
      staves[index] = Math.max(
        staves[index] ?? 1,
        state.clefs.size,
        ...reading.notes.map((note) => note.staff),
      )
      return reading
    })
  })

  const measureCount = Math.max(...sources.map((part) => part.measures.length))
  const { order, expanded } = playOrder(readPlans(sources, measureCount))
  if (expanded) {
    inferred['repeat'] =
      `the ${counted(measureCount, 'written bar', 'written bars')} were played out as ${counted(order.length, 'bar', 'bars')}, a repeat being taken rather than drawn`
  }

  const lengths = Array.from({ length: measureCount }, (_, index) =>
    Math.max(0, ...readings.map((part) => part[index]?.length ?? 0)),
  )

  const parts: Part[] = sources.map((part, index) => ({
    id: `part-${String(index + 1)}`,
    name: part.name,
    colour: `note-part-${String((index % 4) + 1)}`,
  }))

  const sounding: (Sounding & { tieStart: boolean; tieStop: boolean })[] = []
  const pedals: PedalEvent[] = []
  const levels: LevelMark[] = []
  const wedges: Wedge[] = []
  const tempos: TempoEvent[] = []
  const meters: TimeSignatureEvent[] = []
  const keys: KeyMark[] = []
  // Voices are numbered across the whole score, because a voice in this format
  // is not scoped to a part: two parts both calling a line "1" are two lines.
  const voiceNumbers = new Map<string, number>()
  let guessedHands = 0

  let at = 0
  for (const measureIndex of order) {
    readings.forEach((part, partIndex) => {
      const reading = part[measureIndex]
      if (reading === undefined) {
        return
      }
      const staffCount = staves[partIndex] ?? 1
      const partId = parts[partIndex]?.id ?? 'part-1'

      for (const note of reading.notes) {
        const voiceKey = `${String(partIndex)}:${note.voice}`
        let voice = voiceNumbers.get(voiceKey)
        if (voice === undefined) {
          voice = voiceNumbers.size
          voiceNumbers.set(voiceKey, voice)
        }
        const { hand, stated } = handOfStaff(note.staff, reading.clefs, staffCount, note.pitch)
        if (!stated) {
          guessedHands += 1
        }
        sounding.push({
          pitch: note.pitch,
          ...(note.spelling === undefined ? {} : { spelling: note.spelling }),
          start: at + note.start,
          duration: note.duration,
          velocity: note.velocity,
          voice,
          hand,
          ...(note.finger === undefined ? {} : { finger: note.finger }),
          ...(note.articulation === undefined ? {} : { articulation: note.articulation }),
          part: partId,
          tieStart: note.tieStart,
          tieStop: note.tieStop,
        })
      }

      pedals.push(...reading.pedals.map((event) => ({ ...event, tick: at + event.tick })))
      levels.push(...reading.dynamics.map((mark) => ({ ...mark, tick: at + mark.tick })))
      wedges.push(...reading.wedges.map((wedge) => ({ ...wedge, tick: at + wedge.tick })))
      tempos.push(...reading.tempos.map((event) => ({ ...event, tick: at + event.tick })))
      meters.push(...reading.meters.map((event) => ({ ...event, tick: at + event.tick })))
      keys.push(...reading.keys.map((key) => ({ ...key, tick: at + key.tick })))
    })
    at += lengths[measureIndex] ?? 0
  }

  if (guessedHands > 0) {
    inferred['hand'] =
      `${counted(guessedHands, 'note', 'notes')} were split between the hands at middle C, since nothing said which staff or clef they were written on`
  }

  sounding.sort((a, b) => a.start - b.start || a.pitch - b.pitch)
  const notes = resolveVoices(joinTies(sounding, inferred), inferred)

  const firstMeasure = sources[0]?.measures[0]
  const pickupTicks =
    firstMeasure?.attributes['implicit'] === 'yes' ? Math.max(0, lengths[0] ?? 0) : 0

  const identification = child(root, 'identification')
  for (const rights of children(identification, 'rights')) {
    if (rights.text !== '') {
      leftovers.rights.add(rights.text)
    }
  }
  const creator = (type: string): string | undefined => {
    const text = children(identification, 'creator').find(
      (entry) => entry.attributes['type']?.toLowerCase() === type,
    )?.text
    return text === undefined || text === '' ? undefined : text
  }
  const composer = creator('composer')
  const arranger = creator('arranger')

  const title =
    childText(child(root, 'work'), 'work-title') ??
    childText(root, 'movement-title') ??
    (options.title?.trim() === '' ? undefined : options.title?.trim()) ??
    'Imported MusicXML'

  const sortedKeys = [...keys].sort((a, b) => a.tick - b.tick)
  const firstKey = sortedKeys[0]
  const keyChanges = sortedKeys.filter(
    (key, index) => index > 0 && key.name !== sortedKeys[index - 1]?.name,
  ).length

  const dynamics = rampDynamics(levels, wedges)
  const expression = {
    ...(pedals.length > 0
      ? {
          pedals: withoutRepeats(
            pedals,
            (a, b) => a.tick === b.tick && a.pedal === b.pedal && a.value === b.value,
          ),
        }
      : {}),
    ...(dynamics.length > 0
      ? { dynamics: withoutRepeats(dynamics, (a, b) => a.tick === b.tick && a.level === b.level) }
      : {}),
  }

  const parsed = parseScore({
    formatVersion: FORMAT_VERSION,
    metadata: {
      title,
      ...(composer === undefined ? {} : { composer }),
      ...(arranger === undefined ? {} : { arranger }),
      ...(firstKey === undefined ? {} : { key: firstKey.name }),
    },
    timing: {
      ticksPerQuarter,
      tempo: withoutRepeats(
        tempos,
        (a, b) => a.microsecondsPerQuarter === b.microsecondsPerQuarter,
      ),
      timeSignatures: withoutRepeats(
        meters,
        (a, b) => a.numerator === b.numerator && a.denominator === b.denominator,
      ),
      ...(pickupTicks > 0 ? { pickupTicks } : {}),
    },
    ...(notes.length > 0 ? { parts, notes } : {}),
    ...(Object.keys(expression).length > 0 ? { expression } : {}),
    ...(Object.keys(inferred).length > 0
      ? { extensions: { [MUSICXML_IMPORT_EXTENSION]: { inferred } } }
      : {}),
  })

  if (!parsed.ok) {
    return {
      ok: false,
      message: `the document was read, but the score made from it does not validate:\n${parsed.message}`,
    }
  }

  return {
    ok: true,
    score: parsed.score,
    dropped: describeLeftovers(leftovers, keyChanges),
    inferred: Object.values(inferred),
  }
}
