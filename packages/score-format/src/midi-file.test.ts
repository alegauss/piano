import { describe, expect, it } from 'vitest'

import {
  decodeText,
  encodeText,
  META,
  MidiFileError,
  readMidiFile,
  writeMidiFile,
  type MidiEvent,
} from './midi-file'

/** A chunk: four ASCII bytes, a 32-bit length, then the body. */
function chunk(id: string, body: readonly number[]): number[] {
  const length = body.length
  return [
    ...Array.from(id, (letter) => letter.charCodeAt(0)),
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...body,
  ]
}

function header(format: number, tracks: number, division: number): number[] {
  return chunk('MThd', [0, format, 0, tracks, (division >> 8) & 0xff, division & 0xff])
}

function file(...parts: number[][]): Uint8Array {
  return Uint8Array.from(parts.flat())
}

describe('readMidiFile', () => {
  it('reads a track typed out by hand, running status and all', () => {
    // Written without the writer on purpose: a reader checked only against its
    // own writer can share its misunderstanding and still pass.
    // prettier-ignore
    const track = [
      0x00, 0xff, 0x03, 0x04, 0x54, 0x65, 0x73, 0x74, // track name "Test"
      0x00, 0x90, 0x3c, 0x64, // note on C4, velocity 100
      0x00, 0x40, 0x5a, // running status: note on E4, velocity 90
      0x60, 0x3c, 0x00, // 96 ticks later, running status: C4 at velocity 0 is a release
      0x81, 0x00, 0x80, 0x40, 0x40, // 128 ticks later, a real note-off for E4
      0x00, 0xff, 0x2f, 0x00, // end of track
    ]
    const bytes = file(header(0, 1, 96), chunk('MTrk', track))

    const read = readMidiFile(bytes)
    expect(read.format).toBe(0)
    expect(read.division).toBe(96)
    expect(read.tracks).toHaveLength(1)

    const events = read.tracks[0]?.events ?? []
    const notes = events.filter((event) => event.kind === 'noteOn' || event.kind === 'noteOff')
    expect(notes).toEqual([
      { tick: 0, kind: 'noteOn', channel: 0, pitch: 60, velocity: 100 },
      { tick: 0, kind: 'noteOn', channel: 0, pitch: 64, velocity: 90 },
      { tick: 96, kind: 'noteOff', channel: 0, pitch: 60, velocity: 0 },
      { tick: 224, kind: 'noteOff', channel: 0, pitch: 64, velocity: 64 },
    ])
    const name = events.find((event) => event.kind === 'meta' && event.type === META.trackName)
    expect(name?.kind === 'meta' && decodeText(name.data)).toBe('Test')
  })

  it('skips a chunk type it does not know, as the standard asks', () => {
    const bytes = file(
      header(0, 1, 480),
      chunk('XFIH', [1, 2, 3]),
      chunk('MTrk', [0x00, 0xff, 0x2f, 0x00]),
    )
    expect(readMidiFile(bytes).tracks).toHaveLength(1)
  })

  it('refuses something that is not a MIDI file, saying what it looked for', () => {
    expect(() => readMidiFile(Uint8Array.from([0x49, 0x44, 0x33, 0x04]))).toThrow(/MThd/)
  })

  it('refuses SMPTE timing, which has no bars to read', () => {
    expect(() => readMidiFile(file(header(1, 0, 0xe728)))).toThrow(/SMPTE/)
  })

  it('refuses a format 2 file, which is not one piece', () => {
    expect(() => readMidiFile(file(header(2, 0, 480)))).toThrow(/format 2/)
  })

  it('says where a file stops short', () => {
    const bytes = file(header(0, 1, 480), chunk('MTrk', [0x00, 0x90, 0x3c]))
    expect(() => readMidiFile(bytes)).toThrow(MidiFileError)
    expect(() => readMidiFile(bytes)).toThrow(/ends in the middle/)
  })

  it('says when a track claims more bytes than the file holds', () => {
    const bytes = file(header(0, 1, 480), [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 50, 0x00])
    expect(() => readMidiFile(bytes)).toThrow(/claims 50 bytes/)
  })

  it('refuses a data byte with no status before it', () => {
    const bytes = file(header(0, 1, 480), chunk('MTrk', [0x00, 0x3c, 0x40]))
    expect(() => readMidiFile(bytes)).toThrow(/no status/)
  })

  it('says when the header promises tracks the file does not hold', () => {
    expect(() => readMidiFile(file(header(1, 2, 480)))).toThrow(/promises 2 tracks/)
  })
})

describe('writeMidiFile', () => {
  const events: MidiEvent[] = [
    { tick: 0, kind: 'meta', type: META.trackName, data: encodeText('Round trip') },
    { tick: 0, kind: 'program', channel: 2, program: 0 },
    { tick: 0, kind: 'controller', channel: 2, controller: 64, value: 127 },
    { tick: 0, kind: 'noteOn', channel: 2, pitch: 60, velocity: 80 },
    { tick: 200_000, kind: 'noteOff', channel: 2, pitch: 60, velocity: 64 },
    { tick: 200_000, kind: 'pitchBend', channel: 2, value: -8192 },
    { tick: 200_001, kind: 'aftertouch', channel: 2, pressure: 30 },
    { tick: 200_001, kind: 'aftertouch', channel: 2, pitch: 61, pressure: 31 },
    { tick: 200_002, kind: 'sysex', data: Uint8Array.from([0x7e, 0x7f, 0xf7]) },
  ]

  it('writes what the reader reads back, event for event', () => {
    const bytes = writeMidiFile({ format: 1, division: 480, tracks: [{ events }] })
    const read = readMidiFile(bytes)
    expect(read.format).toBe(1)
    expect(read.division).toBe(480)
    const back = read.tracks[0]?.events ?? []
    // The writer supplies the end of the track; everything else is as given.
    expect(back.slice(0, -1)).toEqual(events)
    expect(back.at(-1)).toMatchObject({ kind: 'meta', type: META.endOfTrack, tick: 200_002 })
  })

  it('keeps the given order within a tick', () => {
    const sameTick: MidiEvent[] = [
      { tick: 10, kind: 'noteOff', channel: 0, pitch: 60, velocity: 64 },
      { tick: 10, kind: 'noteOn', channel: 0, pitch: 60, velocity: 90 },
    ]
    const bytes = writeMidiFile({ format: 0, division: 96, tracks: [{ events: sameTick }] })
    expect(readMidiFile(bytes).tracks[0]?.events.slice(0, 2)).toEqual(sameTick)
  })

  it('writes delta times past the one-byte range', () => {
    const far: MidiEvent[] = [
      { tick: 0x0fffffff, kind: 'noteOn', channel: 0, pitch: 60, velocity: 90 },
    ]
    const bytes = writeMidiFile({ format: 0, division: 96, tracks: [{ events: far }] })
    expect(readMidiFile(bytes).tracks[0]?.events[0]?.tick).toBe(0x0fffffff)
  })

  it('refuses a division a header cannot hold', () => {
    expect(() => writeMidiFile({ format: 0, division: 40_000, tracks: [] })).toThrow(/32767/)
  })
})

describe('text in meta events', () => {
  it('round-trips a name outside ASCII as UTF-8', () => {
    expect(decodeText(encodeText('Für Elise — Nº 1'))).toBe('Für Elise — Nº 1')
  })

  it('reads an older Latin-1 name that is not valid UTF-8', () => {
    // "Für" in Latin-1: the ü is a lone 0xFC byte.
    expect(decodeText(Uint8Array.from([0x46, 0xfc, 0x72]))).toBe('Für')
  })
})
