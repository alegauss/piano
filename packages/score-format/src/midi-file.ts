/**
 * Standard MIDI Files at the level of bytes.
 *
 * Chunks, variable-length numbers and running status, and nothing about what a
 * score is: midi.ts maps between the two. Keeping the halves apart is what lets
 * this one be tested against bytes typed out by hand rather than only against
 * its own writer, because a reader and a writer that share a misunderstanding
 * round-trip perfectly.
 *
 * Written here rather than taken from a library: the format is small and has
 * not changed in decades, and this package runs in main, in the renderer and in
 * the MCP server with one dependency, which is worth more than the few hundred
 * lines a second one would save.
 */

/** Refused input, with a sentence saying what was wrong and where. */
export class MidiFileError extends Error {
  override readonly name = 'MidiFileError'
}

/** The meta event types this package reads or writes, by the numbers the file uses. */
export const META = {
  text: 0x01,
  copyright: 0x02,
  trackName: 0x03,
  instrumentName: 0x04,
  lyric: 0x05,
  marker: 0x06,
  cuePoint: 0x07,
  endOfTrack: 0x2f,
  tempo: 0x51,
  smpteOffset: 0x54,
  timeSignature: 0x58,
  keySignature: 0x59,
} as const

/** Every event carries an absolute tick, so nothing downstream sums deltas. */
export type MidiEvent = { readonly tick: number } & (
  | {
      readonly kind: 'noteOn' | 'noteOff'
      readonly channel: number
      readonly pitch: number
      readonly velocity: number
    }
  | {
      readonly kind: 'controller'
      readonly channel: number
      readonly controller: number
      readonly value: number
    }
  | { readonly kind: 'program'; readonly channel: number; readonly program: number }
  | { readonly kind: 'pitchBend'; readonly channel: number; readonly value: number }
  | {
      readonly kind: 'aftertouch'
      readonly channel: number
      readonly pressure: number
      /** Present for polyphonic aftertouch, absent for the channel-wide kind. */
      readonly pitch?: number
    }
  | { readonly kind: 'meta'; readonly type: number; readonly data: Uint8Array }
  | { readonly kind: 'sysex'; readonly data: Uint8Array }
)

export type MidiTrack = { readonly events: readonly MidiEvent[] }

export type MidiFile = {
  /** 0 is one track holding every channel, 1 is several tracks played together. */
  readonly format: 0 | 1
  /** Ticks per quarter note. */
  readonly division: number
  readonly tracks: readonly MidiTrack[]
}

/** The largest ticks-per-quarter a header can state: the top bit means SMPTE timing instead. */
export const MAX_DIVISION = 0x7fff

/** The largest number a variable-length quantity holds in its four permitted bytes. */
const MAX_VARIABLE_LENGTH = 0x0fffffff

class Cursor {
  position: number

  constructor(
    private readonly bytes: Uint8Array,
    start: number,
    readonly end: number,
  ) {
    this.position = start
  }

  get done(): boolean {
    return this.position >= this.end
  }

  peek(): number | undefined {
    return this.position < this.end ? this.bytes[this.position] : undefined
  }

  byte(what: string): number {
    const value = this.peek()
    if (value === undefined) {
      throw new MidiFileError(`the file ends in the middle of ${what}`)
    }
    this.position += 1
    return value
  }

  uint(width: number, what: string): number {
    let value = 0
    for (let index = 0; index < width; index += 1) {
      value = value * 256 + this.byte(what)
    }
    return value
  }

  /** Seven bits per byte, high bit meaning "more follows", at most four bytes. */
  variableLength(what: string): number {
    let value = 0
    for (let index = 0; index < 4; index += 1) {
      const byte = this.byte(what)
      value = value * 128 + (byte & 0x7f)
      if ((byte & 0x80) === 0) {
        return value
      }
    }
    throw new MidiFileError(`${what} runs past the four bytes a variable-length number may use`)
  }

  slice(length: number, what: string): Uint8Array {
    if (this.position + length > this.end) {
      throw new MidiFileError(`the file ends in the middle of ${what}`)
    }
    const data = this.bytes.slice(this.position, this.position + length)
    this.position += length
    return data
  }

  ascii(length: number, what: string): string {
    return String.fromCharCode(...this.slice(length, what))
  }
}

/** A data byte, which must leave the high bit clear: a set one is a status byte out of place. */
function dataByte(cursor: Cursor, what: string): number {
  const value = cursor.byte(what)
  if (value >= 0x80) {
    throw new MidiFileError(
      `${what} holds 0x${value.toString(16)}, which is a status byte where data belongs`,
    )
  }
  return value
}

function readTrack(cursor: Cursor, index: number): MidiTrack {
  const events: MidiEvent[] = []
  const where = `track ${String(index + 1)}`
  let tick = 0
  // Running status: a channel event may leave its status byte out and reuse
  // the previous one. Most writers do, because it shrinks a dense track by a
  // third.
  let running: number | null = null

  while (!cursor.done) {
    tick += cursor.variableLength(`a delta time in ${where}`)
    const first = cursor.peek()
    if (first === undefined) {
      throw new MidiFileError(`${where} ends after a delta time with no event`)
    }

    let status: number
    if (first >= 0x80) {
      status = cursor.byte(where)
    } else if (running !== null) {
      status = running
    } else {
      throw new MidiFileError(
        `${where} has a data byte at tick ${String(tick)} with no status before it`,
      )
    }

    if (status === 0xff) {
      const type = cursor.byte(`a meta event in ${where}`)
      const length = cursor.variableLength(`a meta event in ${where}`)
      const data = cursor.slice(length, `a meta event in ${where}`)
      events.push({ tick, kind: 'meta', type, data })
      if (type === META.endOfTrack) {
        // Anything after the end of a track is not part of it.
        cursor.position = cursor.end
      }
      continue
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = cursor.variableLength(`a system exclusive message in ${where}`)
      events.push({
        tick,
        kind: 'sysex',
        data: cursor.slice(length, `a system exclusive message in ${where}`),
      })
      continue
    }

    if (status >= 0xf0) {
      throw new MidiFileError(
        `${where} holds status 0x${status.toString(16)} at tick ${String(tick)}, which belongs on a live cable and never in a file`,
      )
    }

    running = status
    const channel = status & 0x0f
    const what = `an event in ${where}`

    switch (status & 0xf0) {
      case 0x80: {
        const pitch = dataByte(cursor, what)
        const velocity = dataByte(cursor, what)
        events.push({ tick, kind: 'noteOff', channel, pitch, velocity })
        break
      }
      case 0x90: {
        const pitch = dataByte(cursor, what)
        const velocity = dataByte(cursor, what)
        // A note-on at velocity zero is a note-off, and writers use it so that
        // running status covers a whole passage.
        events.push({ tick, kind: velocity === 0 ? 'noteOff' : 'noteOn', channel, pitch, velocity })
        break
      }
      case 0xa0: {
        const pitch = dataByte(cursor, what)
        const pressure = dataByte(cursor, what)
        events.push({ tick, kind: 'aftertouch', channel, pitch, pressure })
        break
      }
      case 0xb0: {
        const controller = dataByte(cursor, what)
        const value = dataByte(cursor, what)
        events.push({ tick, kind: 'controller', channel, controller, value })
        break
      }
      case 0xc0:
        events.push({ tick, kind: 'program', channel, program: dataByte(cursor, what) })
        break
      case 0xd0:
        events.push({ tick, kind: 'aftertouch', channel, pressure: dataByte(cursor, what) })
        break
      default: {
        const low = dataByte(cursor, what)
        const high = dataByte(cursor, what)
        events.push({ tick, kind: 'pitchBend', channel, value: high * 128 + low - 8192 })
        break
      }
    }
  }

  return { events }
}

/**
 * Read a file into tracks of events at absolute ticks.
 *
 * Throws MidiFileError, with a sentence, for anything that is not a file this
 * app can use: another format, SMPTE timing, a format-2 file of independent
 * patterns, or bytes that stop in the middle of something.
 */
export function readMidiFile(bytes: Uint8Array): MidiFile {
  const header = new Cursor(bytes, 0, bytes.length)
  if (bytes.length < 4 || header.ascii(4, 'the header') !== 'MThd') {
    throw new MidiFileError('this is not a MIDI file: it does not start with "MThd"')
  }
  const headerLength = header.uint(4, 'the header')
  if (headerLength < 6) {
    throw new MidiFileError(`the header is ${String(headerLength)} bytes long; it needs six`)
  }
  const body = new Cursor(bytes, header.position, header.position + headerLength)
  const format = body.uint(2, 'the header')
  const trackCount = body.uint(2, 'the header')
  const division = body.uint(2, 'the header')

  if (format === 2) {
    throw new MidiFileError(
      'this is a format 2 file, which holds independent patterns rather than one piece',
    )
  }
  if (format !== 0 && format !== 1) {
    throw new MidiFileError(`the header declares format ${String(format)}; there are 0, 1 and 2`)
  }
  if ((division & 0x8000) !== 0) {
    throw new MidiFileError(
      'the file times itself in SMPTE frames rather than in beats, so it has no bars to read',
    )
  }
  if (division === 0) {
    throw new MidiFileError('the header says a quarter note lasts zero ticks')
  }

  const tracks: MidiTrack[] = []
  let position = header.position + headerLength

  while (tracks.length < trackCount && position < bytes.length) {
    const chunk = new Cursor(bytes, position, bytes.length)
    const id = chunk.ascii(4, 'a chunk header')
    const length = chunk.uint(4, 'a chunk header')
    const end = chunk.position + length
    if (end > bytes.length) {
      throw new MidiFileError(
        `${id === 'MTrk' ? `track ${String(tracks.length + 1)}` : `a "${id}" chunk`} claims ${String(length)} bytes and the file has ${String(bytes.length - chunk.position)} left`,
      )
    }
    // Chunks of any other type are allowed by the standard and skipped by
    // every reader; that is how the format was meant to grow.
    if (id === 'MTrk') {
      tracks.push(readTrack(new Cursor(bytes, chunk.position, end), tracks.length))
    }
    position = end
  }

  if (tracks.length < trackCount) {
    throw new MidiFileError(
      `the header promises ${String(trackCount)} tracks and the file holds ${String(tracks.length)}`,
    )
  }

  return { format, division, tracks }
}

function pushUint(out: number[], value: number, width: number): void {
  for (let shift = (width - 1) * 8; shift >= 0; shift -= 8) {
    out.push(Math.floor(value / 2 ** shift) & 0xff)
  }
}

function pushVariableLength(out: number[], value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_VARIABLE_LENGTH) {
    throw new MidiFileError(`${String(value)} cannot be written as a variable-length number`)
  }
  const groups = [value & 0x7f]
  let rest = Math.floor(value / 128)
  while (rest > 0) {
    groups.unshift((rest & 0x7f) | 0x80)
    rest = Math.floor(rest / 128)
  }
  out.push(...groups)
}

function pushAscii(out: number[], text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    out.push(text.charCodeAt(index))
  }
}

function pushEvent(out: number[], event: MidiEvent): void {
  switch (event.kind) {
    case 'noteOn':
      out.push(0x90 | event.channel, event.pitch, event.velocity)
      return
    case 'noteOff':
      out.push(0x80 | event.channel, event.pitch, event.velocity)
      return
    case 'controller':
      out.push(0xb0 | event.channel, event.controller, event.value)
      return
    case 'program':
      out.push(0xc0 | event.channel, event.program)
      return
    case 'pitchBend': {
      const raw = event.value + 8192
      out.push(0xe0 | event.channel, raw & 0x7f, (raw >> 7) & 0x7f)
      return
    }
    case 'aftertouch':
      if (event.pitch === undefined) {
        out.push(0xd0 | event.channel, event.pressure)
      } else {
        out.push(0xa0 | event.channel, event.pitch, event.pressure)
      }
      return
    case 'sysex':
      out.push(0xf0)
      pushVariableLength(out, event.data.length)
      out.push(...event.data)
      return
    case 'meta':
      out.push(0xff, event.type)
      pushVariableLength(out, event.data.length)
      out.push(...event.data)
      return
  }
}

/**
 * Write tracks of events at absolute ticks.
 *
 * Events are ordered by tick, keeping the given order within a tick, so a
 * caller that wants a note-off before a note-on at the same moment says so by
 * listing it first. Every track gets its end-of-track event, at the latest tick
 * any event in it names. Status bytes are written in full: running status saves
 * bytes nobody is short of, and a file without it is one every reader reads.
 */
export function writeMidiFile(file: MidiFile): Uint8Array {
  if (!Number.isInteger(file.division) || file.division < 1 || file.division > MAX_DIVISION) {
    throw new MidiFileError(
      `${String(file.division)} ticks per quarter cannot be written; a header holds 1 to ${String(MAX_DIVISION)}`,
    )
  }

  const out: number[] = []
  pushAscii(out, 'MThd')
  pushUint(out, 6, 4)
  pushUint(out, file.format, 2)
  pushUint(out, file.tracks.length, 2)
  pushUint(out, file.division, 2)

  for (const track of file.tracks) {
    const events = [...track.events].sort((a, b) => a.tick - b.tick)
    const end = events.reduce((latest, event) => Math.max(latest, event.tick), 0)
    const body: number[] = []
    let previous = 0

    for (const event of events) {
      if (event.kind === 'meta' && event.type === META.endOfTrack) {
        continue
      }
      pushVariableLength(body, event.tick - previous)
      previous = event.tick
      pushEvent(body, event)
    }
    pushVariableLength(body, end - previous)
    body.push(0xff, META.endOfTrack, 0)

    pushAscii(out, 'MTrk')
    pushUint(out, body.length, 4)
    for (const byte of body) {
      out.push(byte)
    }
  }

  return Uint8Array.from(out)
}

/**
 * Text from a meta event.
 *
 * The standard never said which encoding, so older files are Latin-1 and newer
 * ones UTF-8. Try UTF-8 and fall back, since bytes that happen to be valid
 * UTF-8 and were meant as Latin-1 are rare in a track name.
 */
export function decodeText(data: Uint8Array): string {
  let escaped = ''
  for (const byte of data) {
    escaped += `%${byte.toString(16).padStart(2, '0')}`
  }
  try {
    return decodeURIComponent(escaped)
  } catch {
    return String.fromCharCode(...data)
  }
}

/** Text for a meta event, as UTF-8, which is what current readers expect. */
export function encodeText(text: string): Uint8Array {
  let encoded: string
  try {
    encoded = encodeURIComponent(text)
  } catch {
    // A lone surrogate has no UTF-8 spelling; it cannot have been meant.
    encoded = encodeURIComponent(text.replace(/[\uD800-\uDFFF]/g, '?'))
  }
  const bytes: number[] = []
  for (let index = 0; index < encoded.length; index += 1) {
    if (encoded[index] === '%') {
      bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16))
      index += 2
    } else {
      bytes.push(encoded.charCodeAt(index))
    }
  }
  return Uint8Array.from(bytes)
}
