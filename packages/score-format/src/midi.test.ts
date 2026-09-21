import { describe, expect, it } from 'vitest'

import { soundingNote } from './expression'
import { VALID_FIXTURES } from './fixtures/index'
import { exportMidi, importMidi, MIDI_IMPORT_EXTENSION } from './midi'
import { encodeText, META, readMidiFile, writeMidiFile, type MidiEvent } from './midi-file'
import { voiceOf } from './note'
import { parseScore } from './parse'
import { partOf } from './part'
import { notesOf, scoreParts, timingOf, type Score } from './score'

function load(raw: unknown): Score {
  const result = parseScore(raw)
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result.score
}

function imported(bytes: Uint8Array, title?: string) {
  const result = importMidi(bytes, title === undefined ? {} : { title })
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result
}

function name(text: string): MidiEvent {
  return { tick: 0, kind: 'meta', type: META.trackName, data: encodeText(text) }
}

function note(channel: number, pitch: number, start: number, end: number, velocity = 80) {
  return [
    { tick: start, kind: 'noteOn', channel, pitch, velocity },
    { tick: end, kind: 'noteOff', channel, pitch, velocity: 64 },
  ] satisfies MidiEvent[]
}

/** A format 1 file from tracks of events, with the writer doing the bytes. */
function midi(tracks: MidiEvent[][], division = 480): Uint8Array {
  return writeMidiFile({ format: 1, division, tracks: tracks.map((events) => ({ events })) })
}

/**
 * What a score sounds like, note by note: the thing a round trip through MIDI
 * has to keep. Velocities and lengths are the played ones, because that is
 * what export writes.
 */
function heard(score: Score) {
  const names = new Map(scoreParts(score).map((part) => [part.id, part.name]))
  return notesOf(score)
    .map((note) => {
      const sounding = soundingNote(note, score.expression, note.articulation)
      return {
        pitch: note.pitch,
        start: note.start,
        duration: sounding.duration,
        velocity: sounding.velocity,
        voice: voiceOf(note),
        part: names.get(partOf(note)),
      }
    })
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
}

function inferredOf(score: Score): Record<string, string> {
  const extension = score.extensions?.[MIDI_IMPORT_EXTENSION] as
    { inferred?: Record<string, string> } | undefined
  return extension?.inferred ?? {}
}

describe('importMidi', () => {
  it('reads a file typed out byte by byte', () => {
    // Format 0 at 96 ticks to the quarter: 60 bpm, three four, F major, the
    // sustain pedal down for two beats, and one drum hit that has no place on
    // a piano.
    // prettier-ignore
    const track = [
      0x00, 0xff, 0x03, 0x0a, ...Array.from('Test piece', (c) => c.charCodeAt(0)),
      0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
      0x00, 0xff, 0x58, 0x04, 0x03, 0x02, 0x18, 0x08,
      0x00, 0xff, 0x59, 0x02, 0xff, 0x00,
      0x00, 0xc0, 0x00,
      0x00, 0xb0, 0x40, 0x7f,
      0x00, 0x90, 0x3c, 0x64,
      0x00, 0x40, 0x5a,
      0x00, 0xe0, 0x00, 0x40,
      0x00, 0x99, 0x24, 0x64,
      0x60, 0x90, 0x3c, 0x00,
      0x60, 0x80, 0x40, 0x40,
      0x00, 0xb0, 0x40, 0x00,
      0x00, 0x89, 0x24, 0x00,
      0x00, 0xff, 0x2f, 0x00,
    ]
    // prettier-ignore
    const bytes = Uint8Array.from([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length,
      ...track,
    ])

    const result = imported(bytes)
    const { score } = result

    expect(score.metadata).toEqual({ title: 'Test piece', key: 'F major' })
    expect(timingOf(score)).toEqual({
      ticksPerQuarter: 96,
      tempo: [{ tick: 0, microsecondsPerQuarter: 1_000_000 }],
      timeSignatures: [{ tick: 0, numerator: 3, denominator: 4 }],
      pickupTicks: 0,
    })
    expect(score.notes).toEqual([
      { pitch: 60, start: 0, duration: 96, velocity: 100, hand: 'right', part: 'part-1' },
      { pitch: 64, start: 0, duration: 192, velocity: 90, hand: 'right', part: 'part-1' },
    ])
    expect(score.parts).toEqual([{ id: 'part-1', name: 'Piano', colour: 'note-part-1' }])
    expect(score.expression?.pedals).toEqual([
      { tick: 0, pedal: 'sustain', value: 127 },
      { tick: 192, pedal: 'sustain', value: 0 },
    ])
    expect(result.dropped).toEqual([
      '1 note on channel 10, which General MIDI keeps for drums',
      '1 pitch bend',
    ])
    expect(inferredOf(score)['hand']).toMatch(/middle C/)
    expect(result.inferred).toEqual(Object.values(inferredOf(score)))
  })

  it('takes the hand from a track that names it, and joins the two into one part', () => {
    const bytes = midi([
      [name('Sonatina')],
      [name('Piano RH'), ...note(0, 72, 0, 480)],
      [name('Piano LH'), ...note(1, 48, 0, 480)],
    ])
    const { score, inferred } = imported(bytes)
    expect(score.parts).toEqual([{ id: 'part-1', name: 'Piano', colour: 'note-part-1' }])
    expect(score.notes?.map((n) => [n.pitch, n.hand, n.part])).toEqual([
      [48, 'left', 'part-1'],
      [72, 'right', 'part-1'],
    ])
    expect(inferred).toEqual([])
    expect(score.extensions).toBeUndefined()
  })

  it('takes two unnamed tracks for the two hands by register, and says it guessed', () => {
    const bytes = midi([
      [name('Duet')],
      [...note(0, 43, 0, 480), ...note(0, 62, 480, 960)],
      [...note(1, 76, 0, 480)],
    ])
    const { score } = imported(bytes)
    expect(score.parts?.map((part) => part.name)).toEqual(['Track 2', 'Track 3'])
    // Track 2 averages below track 3, so it is the left hand, even for the D
    // above middle C that a split would have given the right.
    expect(score.notes?.map((n) => [n.pitch, n.hand])).toEqual([
      [43, 'left'],
      [76, 'right'],
      [62, 'left'],
    ])
    expect(inferredOf(score)['hand']).toMatch(/higher one as the right/)
  })

  it('names the piece after what the caller says, then after the file', () => {
    const bytes = midi([[name('From the file')], [...note(0, 60, 0, 480)]])
    expect(imported(bytes).score.metadata.title).toBe('From the file')
    expect(imported(bytes, 'nocturne.mid').score.metadata.title).toBe('nocturne.mid')
    expect(imported(midi([[...note(0, 60, 0, 480)]])).score.metadata.title).toBe('Imported MIDI')
  })

  it('ends a note never released where its track ends, and marks the guess', () => {
    const bytes = midi([
      [{ tick: 0, kind: 'noteOn', channel: 0, pitch: 60, velocity: 80 }, ...note(0, 64, 0, 1920)],
    ])
    const { score } = imported(bytes)
    expect(score.notes?.find((n) => n.pitch === 60)?.duration).toBe(1920)
    expect(inferredOf(score)['duration']).toMatch(/never released/)
  })

  it('leaves out a note released at the tick it was struck, and says so', () => {
    const { score, dropped } = imported(midi([[...note(0, 60, 0, 0), ...note(0, 62, 0, 480)]]))
    expect(score.notes?.map((n) => n.pitch)).toEqual([62])
    expect(dropped).toContain('1 note released at the tick it was struck')
  })

  it('gives a key struck while already sounding a voice of its own, so the score is valid', () => {
    // Two tracks both holding middle C: legal in MIDI, and one voice in the
    // format may not overlap itself.
    const bytes = midi([[...note(0, 60, 0, 960)], [...note(1, 60, 480, 1440)]])
    const { score } = imported(bytes)
    expect(score.notes?.map((n) => [n.start, voiceOf(n)])).toEqual([
      [0, 0],
      [480, 1],
    ])
    expect(inferredOf(score)['voice']).toMatch(/1 note struck on a key already sounding/)
  })

  it('pairs a release with the oldest note on its key, as sequencers do', () => {
    const bytes = midi([
      [
        { tick: 0, kind: 'noteOn', channel: 0, pitch: 60, velocity: 90 },
        { tick: 240, kind: 'noteOn', channel: 0, pitch: 60, velocity: 70 },
        { tick: 480, kind: 'noteOff', channel: 0, pitch: 60, velocity: 64 },
        { tick: 960, kind: 'noteOff', channel: 0, pitch: 60, velocity: 64 },
      ],
    ])
    expect(imported(bytes).score.notes?.map((n) => [n.start, n.duration, n.velocity])).toEqual([
      [0, 480, 90],
      [240, 720, 70],
    ])
  })

  it('reports what the file carried and the score cannot, by kind and count', () => {
    const bytes = midi([
      [
        name('Everything else'),
        { tick: 0, kind: 'meta', type: META.copyright, data: encodeText('(c) 1999 Someone') },
        { tick: 0, kind: 'meta', type: META.marker, data: encodeText('Verse') },
        { tick: 0, kind: 'meta', type: META.lyric, data: encodeText('la') },
      ],
      [
        { tick: 0, kind: 'program', channel: 0, program: 40 },
        { tick: 0, kind: 'controller', channel: 0, controller: 7, value: 100 },
        { tick: 0, kind: 'controller', channel: 0, controller: 10, value: 64 },
        { tick: 0, kind: 'controller', channel: 0, controller: 7, value: 90 },
        { tick: 0, kind: 'aftertouch', channel: 0, pressure: 20 },
        { tick: 0, kind: 'sysex', data: Uint8Array.from([0x7e, 0xf7]) },
        ...note(0, 60, 0, 480),
      ],
    ])
    expect(imported(bytes).dropped).toEqual([
      '1 program change to an instrument other than piano; every part plays on the piano',
      '3 controller events other than the three pedals (controller 7 and 10)',
      '1 aftertouch event',
      '1 system exclusive message',
      '1 lyric',
      '1 marker; sections are not made from them',
      `the copyright notice "(c) 1999 Someone"; a score's licence is recorded by a person`,
    ])
  })

  it('keeps the first key and reports the changes after it', () => {
    const key = (tick: number, sharps: number): MidiEvent => ({
      tick,
      kind: 'meta',
      type: META.keySignature,
      data: Uint8Array.from([sharps < 0 ? sharps + 256 : sharps, 1]),
    })
    const { score, dropped } = imported(midi([[key(0, -1), key(1920, 2), ...note(0, 62, 0, 480)]]))
    expect(score.metadata.key).toBe('D minor')
    expect(dropped).toContain('1 key change after the first key')
  })

  it('refuses a file it cannot read, with the reason', () => {
    const result = importMidi(Uint8Array.from([1, 2, 3, 4, 5]))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.message).toMatch(/not a MIDI file/)
  })
})

describe('exportMidi', () => {
  it.each(Object.keys(VALID_FIXTURES))('%s comes back sounding the same', (fixture) => {
    const original = load(VALID_FIXTURES[fixture as keyof typeof VALID_FIXTURES])
    const { score } = imported(exportMidi(original).bytes)

    expect(score.metadata.title).toBe(original.metadata.title)
    expect(timingOf(score)).toEqual(timingOf(original))
    expect(heard(score)).toEqual(heard(original))
    expect(score.expression?.pedals ?? []).toEqual(original.expression?.pedals ?? [])

    // A hand the score stated comes back stated; one it left out is a guess
    // the import owns up to.
    const originals = notesOf(original)
    if (originals.length > 0 && originals.every((n) => n.hand !== undefined)) {
      const hands = (s: Score) =>
        [...notesOf(s)].sort((a, b) => a.start - b.start || a.pitch - b.pitch).map((n) => n.hand)
      expect(hands(score)).toEqual(hands(original))
      expect(inferredOf(score)['hand']).toBeUndefined()
    } else if (originals.length > 0) {
      expect(inferredOf(score)['hand']).toBeDefined()
    }
  })

  it('reports what the score carried and the file cannot', () => {
    const { dropped } = exportMidi(load(VALID_FIXTURES['three-levels']))
    expect(dropped).toEqual([
      '3 note ids',
      '1 articulation, played into the lengths and velocities',
      '1 section',
      '3 arrangements; the file plays the score as written',
      "the parts' colours and roles",
      "the metadata's difficulty and level",
      'the extensions "com.example.study"',
    ])
  })

  it('reports nothing when nothing was lost', () => {
    const score = load({
      formatVersion: 1,
      metadata: { title: 'Plain', key: 'Bb' },
      notes: [{ pitch: 70, start: 0, duration: 480, velocity: 80, hand: 'right' }],
      expression: { pedals: [{ tick: 0, pedal: 'sostenuto', value: 100 }] },
    })
    const { bytes, dropped } = exportMidi(score)
    expect(dropped).toEqual([])
    const back = imported(bytes).score
    expect(back.metadata.key).toBe('Bb major')
    expect(back.expression?.pedals).toEqual([{ tick: 0, pedal: 'sostenuto', value: 100 }])
  })

  it('writes a conductor track, then one track per part and hand', () => {
    const score = load(VALID_FIXTURES['three-levels'])
    const file = readMidiFile(exportMidi(score).bytes)
    expect(file.format).toBe(1)
    expect(file.division).toBe(480)
    const names = file.tracks.map((track) =>
      track.events.flatMap((event) =>
        event.kind === 'meta' && event.type === META.trackName
          ? [String.fromCharCode(...event.data)]
          : [],
      ),
    )
    expect(names).toEqual([
      ['One piece, three levels'],
      ['Melody (right hand)'],
      ['Accompaniment (left hand)'],
    ])
  })

  it('never puts a part on the drum channel', () => {
    const parts = Array.from({ length: 16 }, (_, index) => ({
      id: `p${String(index)}`,
      name: `Part ${String(index)}`,
    }))
    const score = load({
      formatVersion: 1,
      metadata: { title: 'Many parts' },
      parts,
      notes: parts.map((part, index) => ({
        pitch: 40 + index,
        start: 0,
        duration: 480,
        velocity: 80,
        part: part.id,
      })),
    })
    const channels = readMidiFile(exportMidi(score).bytes).tracks.flatMap((track) =>
      track.events.flatMap((event) => (event.kind === 'noteOn' ? [event.channel] : [])),
    )
    expect(channels).toHaveLength(16)
    expect(channels).not.toContain(9)
  })

  it('says so when a pickup is no whole number of beats', () => {
    const score = load({
      formatVersion: 1,
      metadata: { title: 'Odd pickup' },
      timing: { ticksPerQuarter: 480, pickupTicks: 7 },
      notes: [{ pitch: 60, start: 0, duration: 7, velocity: 80 }],
    })
    expect(exportMidi(score).dropped[0]).toMatch(/pickup of 7 ticks/)
  })

  it('rounds a grid finer than a header can state, and says so', () => {
    const score = load({
      formatVersion: 1,
      metadata: { title: 'Fine grid' },
      timing: { ticksPerQuarter: 96_000 },
      notes: [{ pitch: 60, start: 96_000, duration: 48_000, velocity: 80 }],
    })
    const { bytes, dropped } = exportMidi(score)
    expect(dropped[0]).toMatch(/rounded to 480/)
    expect(imported(bytes).score.notes?.[0]).toMatchObject({ start: 480, duration: 240 })
  })

  it('reports a key a key signature cannot name', () => {
    const score = load({ formatVersion: 1, metadata: { title: 'Modal', key: 'E phrygian' } })
    expect(exportMidi(score).dropped).toEqual([
      'the key "E phrygian", which is not one a key signature can name',
    ])
  })
})
