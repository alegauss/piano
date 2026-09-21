/**
 * MIDI in and out, on the tick grid the format was built on.
 *
 * Ticks and a tempo map were chosen so that this would be a mapping rather than
 * a rewrite: a file's division becomes ticksPerQuarter, its tempo and time
 * signature events cross unchanged, and note-on and note-off pairs fold into
 * notes. Import seeds a library from existing material. Export is the honest
 * answer to the non-goal about recording audio, since anyone who wants a
 * recording can take the MIDI into a DAW, and it is the way out that keeps this
 * format from being a trap.
 *
 * Neither direction is lossless, and both say so. Import lists what the file
 * carried that a score has nowhere to put, and marks what it had to guess;
 * export lists what the score carried that a MIDI file cannot. A round trip
 * through MIDI that claimed to preserve a score would be the one lie here that
 * nobody could catch by listening.
 */

import {
  PEDAL_CONTROLLERS,
  soundingNote,
  type DynamicMark,
  type PedalEvent,
  type PedalKind,
} from './expression'
import {
  decodeText,
  encodeText,
  MAX_DIVISION,
  META,
  MidiFileError,
  readMidiFile,
  writeMidiFile,
  type MidiEvent,
  type MidiFile,
  type MidiTrack,
} from './midi-file'
import { voiceOf, type Hand, type Note } from './note'
import { parseScore } from './parse'
import { IMPLICIT_PART_ID, notesByPart, partOf, partsOf, type Part } from './part'
import { notesOf, scoreParts, timingOf, type Score } from './score'
import { flattenSections } from './section'
import {
  DEFAULT_TICKS_PER_QUARTER,
  ticksPerBar,
  type TempoEvent,
  type TimeSignatureEvent,
  type Timing,
} from './time'
import { FORMAT_VERSION } from './version'

/**
 * Where an imported score records what it guessed, so a later reader can tell
 * a hand the file stated from one this code made up.
 */
export const MIDI_IMPORT_EXTENSION = 'piano.midi-import'

export type MidiImportOptions = {
  /** What to call the piece, usually from the file name. The file's own sequence name is the fallback. */
  readonly title?: string
}

export type MidiImport =
  | {
      readonly ok: true
      readonly score: Score
      /** What the file carried that the score has nowhere to put, one sentence each. */
      readonly dropped: readonly string[]
      /** What the score now says that the file did not, and how it was guessed. */
      readonly inferred: readonly string[]
    }
  | { readonly ok: false; readonly message: string }

export type MidiExport = {
  readonly bytes: Uint8Array
  /** What the score carried that the file cannot, one sentence each. Empty means nothing was lost. */
  readonly dropped: readonly string[]
}

/** General MIDI puts drums on channel 10, which is 9 counted from zero. */
const DRUM_CHANNEL = 9

/** Where a note with no hand to go by is split: middle C and above to the right. */
const MIDDLE_C = 60

/** The General MIDI programs that are pianos: acoustic, electric, harpsichord, clavinet. */
const LAST_PIANO_PROGRAM = 7

const DEFAULT_PART_NAME = partsOf({})[0]?.name ?? 'Piano'

const PEDAL_BY_CONTROLLER = new Map<number, PedalKind>(
  (Object.entries(PEDAL_CONTROLLERS) as [PedalKind, number][]).map(([pedal, controller]) => [
    controller,
    pedal,
  ]),
)

/** A key signature's sharps or flats, from seven flats to seven sharps. */
const MAJOR_KEYS: readonly string[] = 'Cb Gb Db Ab Eb Bb F C G D A E B F# C#'.split(' ')
const MINOR_KEYS: readonly string[] = 'Ab Eb Bb F C G D A E B F# C# G# D# A#'.split(' ')

/** Channels a part may use, skipping the drum channel so no part comes back as percussion. */
const MELODIC_CHANNELS = Array.from({ length: 16 }, (_, channel) => channel).filter(
  (channel) => channel !== DRUM_CHANNEL,
)

/** The largest value the three-byte tempo field holds: about 16.7 seconds per quarter. */
const MAX_MICROSECONDS_PER_QUARTER = 0xffffff

function counted(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) {
    return words.join('')
  }
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1] ?? ''}`
}

/** The latest event at each tick wins, which is what a player reading the file would do. */
function lastAtEachTick<T extends { readonly tick: number }>(events: readonly T[]): T[] {
  const byTick = new Map<number, T>()
  for (const event of events) {
    byTick.set(event.tick, event)
  }
  return [...byTick.values()].sort((a, b) => a.tick - b.tick)
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

type HeardNote = {
  readonly pitch: number
  readonly start: number
  readonly duration: number
  readonly velocity: number
}

/** The notes one channel of one track carried: what becomes a part, or half of one. */
type Unit = {
  readonly track: number
  readonly channel: number
  readonly notes: HeardNote[]
}

/** Counts of what was left behind, turned into sentences at the end. */
type Leftovers = {
  drumNotes: number
  instantNotes: number
  otherPrograms: number
  otherControllers: Map<number, number>
  pitchBends: number
  aftertouch: number
  sysex: number
  lyrics: number
  markers: number
  texts: number
  copyright: string[]
  smpteOffset: boolean
  unwritableSignatures: number
}

type Heard = {
  readonly units: Unit[]
  readonly trackNames: (string | undefined)[]
  readonly tempo: TempoEvent[]
  readonly signatures: TimeSignatureEvent[]
  readonly keys: { readonly tick: number; readonly name: string }[]
  readonly pedals: PedalEvent[]
  readonly leftovers: Leftovers
  unreleased: number
}

function keyName(data: Uint8Array): string | null {
  const [rawSharps, minor] = data
  if (rawSharps === undefined || minor === undefined) {
    return null
  }
  // A signed byte: 0xFF is one flat.
  const sharps = rawSharps > 127 ? rawSharps - 256 : rawSharps
  const name = (minor === 1 ? MINOR_KEYS : MAJOR_KEYS)[sharps + 7]
  return name === undefined ? null : `${name} ${minor === 1 ? 'minor' : 'major'}`
}

function hearTrack(track: MidiTrack, index: number, heard: Heard): void {
  const { leftovers } = heard
  const units = new Map<number, Unit>()
  // Notes waiting for their release, per channel and pitch, oldest first.
  const open = new Map<string, { start: number; velocity: number }[]>()
  let end = 0

  const finish = (
    channel: number,
    pitch: number,
    start: number,
    until: number,
    velocity: number,
  ) => {
    if (until <= start) {
      leftovers.instantNotes += 1
      return
    }
    let unit = units.get(channel)
    if (unit === undefined) {
      unit = { track: index, channel, notes: [] }
      units.set(channel, unit)
    }
    unit.notes.push({ pitch, start, duration: until - start, velocity })
  }

  for (const event of track.events) {
    end = Math.max(end, event.tick)

    if (event.kind === 'sysex') {
      leftovers.sysex += 1
      continue
    }
    if (event.kind === 'meta') {
      hearMeta(event.type, event.data, event.tick, index, heard)
      continue
    }

    // Everything on the drum channel is percussion, which a piano cannot play.
    if (event.channel === DRUM_CHANNEL) {
      if (event.kind === 'noteOn') {
        leftovers.drumNotes += 1
      }
      continue
    }

    switch (event.kind) {
      case 'noteOn': {
        const key = `${String(event.channel)}:${String(event.pitch)}`
        const waiting = open.get(key)
        const struck = { start: event.tick, velocity: event.velocity }
        if (waiting === undefined) {
          open.set(key, [struck])
        } else {
          waiting.push(struck)
        }
        break
      }
      case 'noteOff': {
        // A release ends the oldest note still sounding on that key, which is
        // how every sequencer pairs them. A release with nothing to end is
        // noise and is ignored.
        const struck = open.get(`${String(event.channel)}:${String(event.pitch)}`)?.shift()
        if (struck !== undefined) {
          finish(event.channel, event.pitch, struck.start, event.tick, struck.velocity)
        }
        break
      }
      case 'controller': {
        const pedal = PEDAL_BY_CONTROLLER.get(event.controller)
        if (pedal === undefined) {
          const seen = leftovers.otherControllers.get(event.controller) ?? 0
          leftovers.otherControllers.set(event.controller, seen + 1)
        } else {
          heard.pedals.push({ tick: event.tick, pedal, value: event.value })
        }
        break
      }
      case 'program':
        if (event.program > LAST_PIANO_PROGRAM) {
          leftovers.otherPrograms += 1
        }
        break
      case 'pitchBend':
        leftovers.pitchBends += 1
        break
      case 'aftertouch':
        leftovers.aftertouch += 1
        break
    }
  }

  // A note never released ends with its track: shorter would be a guess too,
  // and this one keeps every note the file struck.
  for (const [key, waiting] of open) {
    const [channel, pitch] = key.split(':').map(Number)
    for (const struck of waiting) {
      heard.unreleased += 1
      finish(channel ?? 0, pitch ?? 0, struck.start, end, struck.velocity)
    }
  }

  heard.units.push(...[...units.values()].sort((a, b) => a.channel - b.channel))
}

function hearMeta(type: number, data: Uint8Array, tick: number, track: number, heard: Heard): void {
  const { leftovers } = heard
  switch (type) {
    case META.trackName:
      heard.trackNames[track] ??= decodeText(data).trim() || undefined
      return
    case META.tempo: {
      const [a = 0, b = 0, c = 0] = data
      const microsecondsPerQuarter = a * 65536 + b * 256 + c
      if (microsecondsPerQuarter > 0) {
        heard.tempo.push({ tick, microsecondsPerQuarter })
      }
      return
    }
    case META.timeSignature: {
      const [numerator = 0, power = 0] = data
      // The format writes meters down to 32nds, which covers every score that
      // is not an exercise in notation.
      if (numerator > 0 && power <= 5) {
        heard.signatures.push({ tick, numerator, denominator: 2 ** power })
      } else {
        leftovers.unwritableSignatures += 1
      }
      return
    }
    case META.keySignature: {
      const name = keyName(data)
      if (name !== null) {
        heard.keys.push({ tick, name })
      }
      return
    }
    case META.lyric:
      leftovers.lyrics += 1
      return
    case META.marker:
      leftovers.markers += 1
      return
    case META.text:
    case META.instrumentName:
    case META.cuePoint:
      leftovers.texts += 1
      return
    case META.copyright: {
      const notice = decodeText(data).trim()
      if (notice !== '') {
        leftovers.copyright.push(notice)
      }
      return
    }
    case META.smpteOffset:
      leftovers.smpteOffset = true
      return
    default:
      // Sequence numbers, ports, channel prefixes, the end of the track and
      // sequencer-specific data say nothing about the music.
      return
  }
}

function describeLeftovers(leftovers: Leftovers, keyChanges: number): string[] {
  const dropped: string[] = []
  const add = (count: number, sentence: string) => {
    if (count > 0) {
      dropped.push(sentence)
    }
  }

  add(
    leftovers.drumNotes,
    `${counted(leftovers.drumNotes, 'note', 'notes')} on channel 10, which General MIDI keeps for drums`,
  )
  add(
    leftovers.instantNotes,
    `${counted(leftovers.instantNotes, 'note', 'notes')} released at the tick it was struck`,
  )
  add(
    leftovers.otherPrograms,
    `${counted(leftovers.otherPrograms, 'program change', 'program changes')} to an instrument other than piano; every part plays on the piano`,
  )
  const controllers = [...leftovers.otherControllers.keys()].sort((a, b) => a - b)
  const controllerEvents = [...leftovers.otherControllers.values()].reduce((a, b) => a + b, 0)
  add(
    controllerEvents,
    `${counted(controllerEvents, 'controller event', 'controller events')} other than the three pedals (controller ${joinWords(controllers.map(String))})`,
  )
  add(leftovers.pitchBends, counted(leftovers.pitchBends, 'pitch bend', 'pitch bends'))
  add(leftovers.aftertouch, counted(leftovers.aftertouch, 'aftertouch event', 'aftertouch events'))
  add(
    leftovers.sysex,
    counted(leftovers.sysex, 'system exclusive message', 'system exclusive messages'),
  )
  add(leftovers.lyrics, counted(leftovers.lyrics, 'lyric', 'lyrics'))
  add(
    leftovers.markers,
    `${counted(leftovers.markers, 'marker', 'markers')}; sections are not made from them`,
  )
  add(leftovers.texts, counted(leftovers.texts, 'text event', 'text events'))
  for (const notice of leftovers.copyright) {
    dropped.push(`the copyright notice "${notice}"; a score's licence is recorded by a person`)
  }
  add(leftovers.smpteOffset ? 1 : 0, 'the SMPTE start offset')
  add(
    leftovers.unwritableSignatures,
    `${counted(leftovers.unwritableSignatures, 'time signature', 'time signatures')} finer than 32nd notes`,
  )
  add(keyChanges, `${counted(keyChanges, 'key change', 'key changes')} after the first key`)

  return dropped
}

/** A hand a track's name states, and the name with it taken out. */
function handFromName(name: string): { readonly hand: Hand; readonly stem: string } | null {
  const match = /\b(right|left|rh|lh)\b(?:\s+hand\b)?/i.exec(name)
  if (match === null) {
    return null
  }
  const word = match[1]?.toLowerCase()
  const hand: Hand = word === 'left' || word === 'lh' ? 'left' : 'right'
  const stem = (name.slice(0, match.index) + name.slice(match.index + match[0].length))
    .replace(/^[\s\-–—:,.()[\]]+|[\s\-–—:,.()[\]]+$/g, '')
    .replace(/\s{2,}/g, ' ')
  return { hand, stem: stem === '' ? DEFAULT_PART_NAME : stem }
}

/**
 * Read a pickup the way MIDI writers spell one: an opening bar in a short
 * meter of its own, followed by the real one.
 */
function readPickup(
  signatures: readonly TimeSignatureEvent[],
  ticksPerQuarter: number,
): { readonly pickupTicks: number; readonly signatures: TimeSignatureEvent[] } | null {
  const [opening, real, ...rest] = signatures
  if (opening === undefined || real === undefined || opening.tick !== 0) {
    return null
  }
  const openingBar = ticksPerBar(opening, ticksPerQuarter)
  if (real.tick !== openingBar || openingBar >= ticksPerBar(real, ticksPerQuarter)) {
    return null
  }
  return { pickupTicks: real.tick, signatures: [{ ...real, tick: 0 }, ...rest] }
}

function meterName(signature: Pick<TimeSignatureEvent, 'numerator' | 'denominator'>): string {
  return `${String(signature.numerator)}/${String(signature.denominator)}`
}

function emptyHearing(): Heard {
  return {
    units: [],
    trackNames: [],
    tempo: [],
    signatures: [],
    keys: [],
    pedals: [],
    leftovers: {
      drumNotes: 0,
      instantNotes: 0,
      otherPrograms: 0,
      otherControllers: new Map(),
      pitchBends: 0,
      aftertouch: 0,
      sysex: 0,
      lyrics: 0,
      markers: 0,
      texts: 0,
      copyright: [],
      smpteOffset: false,
      unwritableSignatures: 0,
    },
    unreleased: 0,
  }
}

type Labelled = {
  readonly unit: Unit
  readonly label: string
  readonly named: { readonly hand: Hand; readonly stem: string } | null
}

/**
 * Name each unit and gather units into parts.
 *
 * In a format 0 file the one track's name is the piece's, not a part's. Units
 * that name their hand and share what is left of the name are one part split
 * across two staves: "Piano RH" and "Piano LH" are one piano.
 */
function readParts(
  file: MidiFile,
  heard: Heard,
): { readonly labelled: Labelled[]; readonly parts: Part[]; readonly partIdOf: string[] } {
  const channelsInTrack = new Map<number, number>()
  for (const unit of heard.units) {
    channelsInTrack.set(unit.track, (channelsInTrack.get(unit.track) ?? 0) + 1)
  }

  const labelOf = (unit: Unit): string => {
    const trackName = file.format === 0 ? undefined : heard.trackNames[unit.track]
    const shared = (channelsInTrack.get(unit.track) ?? 0) > 1
    const channel = `channel ${String(unit.channel + 1)}`
    if (trackName !== undefined) {
      return shared ? `${trackName} (${channel})` : trackName
    }
    if (heard.units.length === 1) {
      return DEFAULT_PART_NAME
    }
    if (file.format === 0) {
      return `Channel ${String(unit.channel + 1)}`
    }
    const track = `Track ${String(unit.track + 1)}`
    return shared ? `${track} (${channel})` : track
  }

  const labelled = heard.units.map((unit) => {
    const label = labelOf(unit)
    return { unit, label, named: handFromName(label) }
  })

  const stems = new Set(labelled.flatMap((entry) => (entry.named ? [entry.named.stem] : [])))
  const parts: Part[] = []
  const partIdByGroup = new Map<string, string>()
  const partIdOf = labelled.map((entry, index) => {
    const name = entry.named?.stem ?? entry.label
    const group = entry.named !== null || stems.has(name) ? `stem:${name}` : `unit:${String(index)}`
    let id = partIdByGroup.get(group)
    if (id === undefined) {
      id = `part-${String(parts.length + 1)}`
      parts.push({ id, name, colour: `note-part-${String((parts.length % 4) + 1)}` })
      partIdByGroup.set(group, id)
    }
    return id
  })

  return { labelled, parts, partIdOf }
}

function average(notes: readonly HeardNote[]): number {
  return notes.reduce((sum, note) => sum + note.pitch, 0) / Math.max(1, notes.length)
}

/**
 * The hand of each unit, where one can be given to the whole unit.
 *
 * A name that states the hand wins. Two unnamed units and nothing else are
 * taken for the two hands by register. Anything still undecided is split note
 * by note at middle C by the caller. Every guess is written into `inferred`.
 */
function readHands(
  labelled: readonly Labelled[],
  inferred: Record<string, string>,
): (Hand | undefined)[] {
  const hands = labelled.map((entry) => entry.named?.hand)
  const unnamed = labelled.flatMap((entry, index) => (entry.named === null ? [index] : []))
  if (unnamed.length === 0) {
    return hands
  }

  const [first, second] = labelled
  if (
    labelled.length === 2 &&
    unnamed.length === 2 &&
    first !== undefined &&
    second !== undefined
  ) {
    const difference = average(first.unit.notes) - average(second.unit.notes)
    if (difference !== 0) {
      hands[0] = difference > 0 ? 'right' : 'left'
      hands[1] = difference > 0 ? 'left' : 'right'
      inferred['hand'] =
        'the two parts were taken for the two hands, the higher one as the right, since neither said which it was'
      return hands
    }
  }

  inferred['hand'] =
    unnamed.length === labelled.length
      ? 'notes were split between the hands at middle C, since no track said which hand it was'
      : 'notes on tracks that did not say which hand they were were split at middle C'
  return hands
}

function handByRegister(pitch: number): Hand {
  return pitch >= MIDDLE_C ? 'right' : 'left'
}

/**
 * One voice may not strike a key that is still sounding, so a note that does
 * gets the lowest voice free on that key. Most files need none.
 */
function assignVoices(notes: readonly Note[], inferred: Record<string, string>): Note[] {
  const soundingUntil = new Map<number, number[]>()
  let revoiced = 0
  const voiced = notes.map((note) => {
    const ends = soundingUntil.get(note.pitch) ?? []
    soundingUntil.set(note.pitch, ends)
    let voice = ends.findIndex((until) => until <= note.start)
    if (voice === -1) {
      voice = ends.length
    }
    ends[voice] = note.start + note.duration
    if (voice === 0) {
      return note
    }
    revoiced += 1
    return { ...note, voice }
  })

  if (revoiced > 0) {
    const own = revoiced === 1 ? 'its' : 'their'
    inferred['voice'] =
      `${counted(revoiced, 'note', 'notes')} struck on a key already sounding got a voice of ${own} own`
  }
  return voiced
}

/** Tempo and meter as the file states them, with a pickup read back where one was written. */
function readTiming(
  heard: Heard,
  ticksPerQuarter: number,
  inferred: Record<string, string>,
): Timing {
  // Before the first meter the file is in four four, as MIDI says.
  let signatures = lastAtEachTick(heard.signatures)
  const firstSignature = signatures[0]
  if (firstSignature !== undefined && firstSignature.tick > 0) {
    signatures = [{ tick: 0, numerator: 4, denominator: 4 }, ...signatures]
  }

  const pickup = readPickup(signatures, ticksPerQuarter)
  const [opening, real] = signatures
  if (pickup !== null && opening !== undefined && real !== undefined) {
    inferred['pickupTicks'] =
      `the opening bar of ${meterName(opening)} before ${meterName(real)} was read as a pickup`
    signatures = pickup.signatures
  }

  const tempo = lastAtEachTick(heard.tempo)
  return {
    ticksPerQuarter,
    ...(tempo.length > 0 ? { tempo } : {}),
    ...(signatures.length > 0 ? { timeSignatures: signatures } : {}),
    ...(pickup !== null ? { pickupTicks: pickup.pickupTicks } : {}),
  }
}

/** The same pedal event on several channels is one pedal, not several. */
function onePiano(pedals: readonly PedalEvent[]): PedalEvent[] {
  const seen = new Set<string>()
  return pedals
    .filter((event) => {
      const key = `${String(event.tick)}:${event.pedal}:${String(event.value)}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((a, b) => a.tick - b.tick)
}

/**
 * Read a Standard MIDI File into a score.
 *
 * What cannot be recovered is guessed conservatively and marked as a guess,
 * both in the answer and under the score's extensions: hands come from track
 * names where a track says which hand it is, and otherwise from the tracks'
 * registers or a split at middle C. Fingering and articulation are left out
 * rather than invented. The score is validated before it is returned, so a
 * successful import is a file the app opens.
 */
export function importMidi(bytes: Uint8Array, options: MidiImportOptions = {}): MidiImport {
  let file: MidiFile
  try {
    file = readMidiFile(bytes)
  } catch (error) {
    if (error instanceof MidiFileError) {
      return { ok: false, message: error.message }
    }
    throw error
  }

  const heard = emptyHearing()
  file.tracks.forEach((track, index) => {
    hearTrack(track, index, heard)
  })

  const inferred: Record<string, string> = {}
  const { labelled, parts, partIdOf } = readParts(file, heard)
  const hands = readHands(labelled, inferred)
  const notes = assignVoices(
    labelled
      .flatMap((entry, index) =>
        entry.unit.notes.map((heardNote) => ({
          ...heardNote,
          hand: hands[index] ?? handByRegister(heardNote.pitch),
          part: partIdOf[index] ?? IMPLICIT_PART_ID,
        })),
      )
      .sort((a, b) => a.start - b.start || a.pitch - b.pitch),
    inferred,
  )
  if (heard.unreleased > 0) {
    const verb = heard.unreleased === 1 ? 'ends' : 'end'
    inferred['duration'] =
      `${counted(heard.unreleased, 'note', 'notes')} never released ${verb} where the track ends`
  }
  const timing = readTiming(heard, file.division, inferred)

  // A key signature is a hint for display, so the first one is kept and the
  // rest are reported rather than turned into sections.
  const keys = [...heard.keys].sort((a, b) => a.tick - b.tick)
  const keyChanges = keys.filter((key, index) => index > 0 && key.name !== keys[index - 1]?.name)
  const firstKey = keys[0]
  const pedals = onePiano(heard.pedals)
  const title = options.title?.trim() || heard.trackNames[0] || 'Imported MIDI'

  const parsed = parseScore({
    formatVersion: FORMAT_VERSION,
    metadata: { title, ...(firstKey !== undefined ? { key: firstKey.name } : {}) },
    timing,
    ...(notes.length > 0 ? { parts, notes } : {}),
    ...(pedals.length > 0 ? { expression: { pedals } } : {}),
    ...(Object.keys(inferred).length > 0
      ? { extensions: { [MIDI_IMPORT_EXTENSION]: { inferred } } }
      : {}),
  })
  if (!parsed.ok) {
    return {
      ok: false,
      message: `the file was read, but the score made from it does not validate:\n${parsed.message}`,
    }
  }

  return {
    ok: true,
    score: parsed.score,
    dropped: describeLeftovers(heard.leftovers, keyChanges.length),
    inferred: Object.values(inferred),
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Order within one tick: set-up first, releases before strikes so a repeated key sounds twice. */
function rank(event: MidiEvent): number {
  switch (event.kind) {
    case 'meta':
    case 'sysex':
      return 0
    case 'program':
      return 1
    case 'noteOff':
      return 2
    case 'noteOn':
      return 4
    default:
      return 3
  }
}

function inOrder(events: MidiEvent[]): MidiEvent[] {
  return events.sort((a, b) => a.tick - b.tick || rank(a) - rank(b))
}

function meta(tick: number, type: number, data: Uint8Array | readonly number[]): MidiEvent {
  return { tick, kind: 'meta', type, data: Uint8Array.from(data) }
}

/** A metadata key such as "D minor" or "Bb", as a key signature's two bytes. */
function keySignatureBytes(key: string): [number, number] | null {
  const match = /^\s*([A-G])(#|b)?\s*(major|minor|maj|min|m)?\s*$/i.exec(key)
  if (match === null) {
    return null
  }
  const [, letter = '', accidental = '', mode = ''] = match
  const minor = mode.toLowerCase().startsWith('min') || mode === 'm'
  const tonic = `${letter.toUpperCase()}${accidental}`
  const names: readonly string[] = minor ? MINOR_KEYS : MAJOR_KEYS
  const sharps = names.indexOf(tonic) - 7
  if (sharps < -7) {
    return null
  }
  return [sharps < 0 ? sharps + 256 : sharps, minor ? 1 : 0]
}

/**
 * The meter a pickup can be written as: a whole number of beats, preferring the
 * piece's own beat so four four with a quarter pickup opens in one four.
 */
function pickupMeter(
  pickupTicks: number,
  ticksPerQuarter: number,
  beat: number,
): Pick<TimeSignatureEvent, 'numerator' | 'denominator'> | null {
  for (const denominator of new Set([beat, 4, 8, 16, 32, 2, 1])) {
    const numerator = pickupTicks / ((ticksPerQuarter * 4) / denominator)
    if (Number.isInteger(numerator) && numerator >= 1 && numerator <= 255) {
      return { numerator, denominator }
    }
  }
  return null
}

function describeLosses(score: Score): string[] {
  const dropped: string[] = []
  // Only the parts the score declared: the implicit one carries nothing to lose.
  const parts: readonly Part[] = score.parts ?? []
  const notes = notesOf(score)
  const used = new Set(notes.map(partOf))
  const emptyParts = parts.filter((part) => !used.has(part.id)).length
  const count = (test: (note: Note) => boolean) => notes.filter(test).length
  const add = (amount: number, sentence: string) => {
    if (amount > 0) {
      dropped.push(sentence)
    }
  }

  const ids = count((note) => note.id !== undefined)
  add(ids, `${counted(ids, 'note id', 'note ids')}`)
  const spellings = count((note) => note.spelling !== undefined)
  add(spellings, counted(spellings, 'spelling', 'spellings'))
  const fingers = count((note) => note.finger !== undefined)
  add(fingers, counted(fingers, 'fingering', 'fingerings'))
  const voices = count((note) => voiceOf(note) > 0)
  add(voices, `the voice numbers on ${counted(voices, 'note', 'notes')}`)
  const articulations = count((note) => note.articulation !== undefined)
  add(
    articulations,
    `${counted(articulations, 'articulation', 'articulations')}, played into the lengths and velocities`,
  )
  const dynamics: readonly DynamicMark[] = score.expression?.dynamics ?? []
  add(
    dynamics.length,
    `${counted(dynamics.length, 'dynamic mark', 'dynamic marks')}, played into the velocities`,
  )
  const sections = flattenSections(score.sections ?? []).length
  add(sections, counted(sections, 'section', 'sections'))
  const arrangements = score.arrangements?.length ?? 0
  add(
    arrangements,
    `${counted(arrangements, 'arrangement', 'arrangements')}; the file plays the score as written`,
  )

  const partFields = [
    parts.some((part) => part.colour !== undefined) ? 'colours' : null,
    parts.some((part) => part.role !== undefined) ? 'roles' : null,
    parts.some((part) => part.visible !== undefined) ? 'visibility' : null,
  ].filter((field): field is string => field !== null)
  add(partFields.length, `the parts' ${joinWords(partFields)}`)
  add(emptyParts, counted(emptyParts, 'part with no notes', 'parts with no notes'))

  const { metadata } = score
  const metadataFields = (
    [
      'composer',
      'arranger',
      'difficulty',
      'level',
      'tags',
      'durationSeconds',
      'provenance',
      'generator',
    ] as const
  ).filter((field) => metadata[field] !== undefined)
  add(metadataFields.length, `the metadata's ${joinWords(metadataFields)}`)
  if (metadata.key !== undefined && keySignatureBytes(metadata.key) === null) {
    dropped.push(`the key "${metadata.key}", which is not one a key signature can name`)
  }

  const extensions = Object.keys(score.extensions ?? {})
  add(extensions.length, `the extensions ${joinWords(extensions.map((key) => `"${key}"`))}`)

  return dropped
}

/**
 * Write a score as a Standard MIDI File, format 1.
 *
 * The first track carries the title, tempo, meter and key; then one track per
 * part, split by hand where the notes say which hand plays them, named
 * "Melody (right hand)" so that an import reads the hand back. Velocities and
 * lengths are the ones the app plays, with dynamics and articulation applied,
 * because the reason to export is to hear the piece somewhere else.
 */
export function exportMidi(score: Score): MidiExport {
  const timing = timingOf(score)
  const dropped: string[] = []

  // A header holds at most 32767 ticks per quarter; anything finer is rounded.
  let division = timing.ticksPerQuarter
  let at = (tick: number) => tick
  if (division > MAX_DIVISION) {
    const scale = DEFAULT_TICKS_PER_QUARTER / division
    at = (tick) => Math.round(tick * scale)
    dropped.push(
      `exact positions: ${String(division)} ticks per quarter is finer than a MIDI file can state, so positions were rounded to ${String(DEFAULT_TICKS_PER_QUARTER)}`,
    )
    division = DEFAULT_TICKS_PER_QUARTER
  }

  const conductor: MidiEvent[] = [meta(0, META.trackName, encodeText(score.metadata.title))]

  let clampedTempo = 0
  for (const event of timing.tempo) {
    const value = Math.min(event.microsecondsPerQuarter, MAX_MICROSECONDS_PER_QUARTER)
    if (value !== event.microsecondsPerQuarter) {
      clampedTempo += 1
    }
    conductor.push(
      meta(at(event.tick), META.tempo, [value >> 16, (value >> 8) & 0xff, value & 0xff]),
    )
  }
  if (clampedTempo > 0) {
    dropped.push(
      `${counted(clampedTempo, 'tempo', 'tempos')} slower than a quarter every 16.7 seconds, written at that`,
    )
  }

  // MIDI has no pickup, so a pickup is written the way notation programs
  // write one: an opening bar in a short meter of its own.
  const [firstMeter, ...laterMeters] = timing.timeSignatures
  const meters: TimeSignatureEvent[] = []
  let barsFrom = 0
  if (timing.pickupTicks > 0 && firstMeter !== undefined) {
    const opening = pickupMeter(timing.pickupTicks, timing.ticksPerQuarter, firstMeter.denominator)
    if (opening === null) {
      dropped.push(
        `the pickup of ${String(timing.pickupTicks)} ticks, which no meter spans exactly; bars count from the first note`,
      )
    } else {
      meters.push({ tick: 0, ...opening })
      barsFrom = timing.pickupTicks
    }
  }
  if (firstMeter !== undefined) {
    meters.push({ ...firstMeter, tick: barsFrom })
  }
  meters.push(...laterMeters.map((meter) => ({ ...meter, tick: Math.max(meter.tick, barsFrom) })))
  let unwritableMeters = 0
  for (const meter of lastAtEachTick(meters)) {
    if (meter.numerator > 255) {
      unwritableMeters += 1
      continue
    }
    conductor.push(
      meta(at(meter.tick), META.timeSignature, [
        meter.numerator,
        Math.log2(meter.denominator),
        96 / meter.denominator,
        8,
      ]),
    )
  }
  if (unwritableMeters > 0) {
    dropped.push(
      `${counted(unwritableMeters, 'time signature', 'time signatures')} with more than 255 beats to the bar`,
    )
  }

  const key = score.metadata.key === undefined ? null : keySignatureBytes(score.metadata.key)
  if (key !== null) {
    conductor.push(meta(0, META.keySignature, key))
  }

  // Note tracks: one channel per part, one track per hand within it.
  const parts = scoreParts(score)
  const byPart = notesByPart(parts, notesOf(score))
  const tracks: MidiTrack[] = [{ events: inOrder(conductor) }]
  const pedals = score.expression?.pedals ?? []
  let channelIndex = 0

  const writePedals = (events: MidiEvent[], channel: number) => {
    for (const pedal of pedals) {
      events.push({
        tick: at(pedal.tick),
        kind: 'controller',
        channel,
        controller: PEDAL_CONTROLLERS[pedal.pedal],
        value: pedal.value,
      })
    }
  }

  for (const part of parts) {
    const partNotes = byPart.get(part.id) ?? []
    if (partNotes.length === 0) {
      continue
    }
    const channel = MELODIC_CHANNELS[channelIndex % MELODIC_CHANNELS.length] ?? 0
    const firstOnChannel = channelIndex < MELODIC_CHANNELS.length
    channelIndex += 1

    const byHand = (['right', 'left', undefined] as const)
      .map((hand) => ({ hand, notes: partNotes.filter((note) => note.hand === hand) }))
      .filter((group) => group.notes.length > 0)

    byHand.forEach((group, index) => {
      const name = group.hand === undefined ? part.name : `${part.name} (${group.hand} hand)`
      const events: MidiEvent[] = [meta(0, META.trackName, encodeText(name))]
      if (index === 0 && firstOnChannel) {
        // Acoustic grand, so a General MIDI player does not have to assume it.
        events.push({ tick: 0, kind: 'program', channel, program: 0 })
        // A pedal is per channel in MIDI and for the whole piano in a score,
        // so every channel carries it once.
        writePedals(events, channel)
      }
      for (const note of group.notes) {
        const sounding = soundingNote(note, score.expression, note.articulation)
        const start = at(note.start)
        const end = Math.max(start + 1, at(note.start + sounding.duration))
        events.push(
          { tick: start, kind: 'noteOn', channel, pitch: note.pitch, velocity: sounding.velocity },
          { tick: end, kind: 'noteOff', channel, pitch: note.pitch, velocity: 64 },
        )
      }
      tracks.push({ events: inOrder(events) })
    })
  }

  // Pedalling with no notes still belongs somewhere.
  if (tracks.length === 1 && pedals.length > 0) {
    const events: MidiEvent[] = [meta(0, META.trackName, encodeText(DEFAULT_PART_NAME))]
    writePedals(events, 0)
    tracks.push({ events: inOrder(events) })
  }

  dropped.push(...describeLosses(score))

  return { bytes: writeMidiFile({ format: 1, division, tracks }), dropped }
}
