import { describe, expect, it } from 'vitest'

import { importMusicXml, MUSICXML_IMPORT_EXTENSION } from './musicxml'
import { voiceOf } from './note'
import { partOf } from './part'
import { notesOf, timingOf, type Score } from './score'

/**
 * Every document here is typed out rather than exported from anything, for the
 * same reason midi-file.test.ts types out bytes: there is no MusicXML writer to
 * round-trip against, and a reader checked against its own output agrees with
 * itself about a misreading.
 */

type Body = {
  readonly parts?: string
  readonly head?: string
  readonly measures: string
}

function document({ parts, head, measures }: Body): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  ${head ?? ''}
  <part-list>${parts ?? '<score-part id="P1"><part-name>Piano</part-name></score-part>'}</part-list>
  <part id="P1">${measures}</part>
</score-partwise>`
}

function imported(xml: string, title?: string) {
  const result = importMusicXml(xml, title === undefined ? {} : { title })
  if (!result.ok) {
    throw new Error(result.message)
  }
  return result
}

function score(xml: string): Score {
  return imported(xml).score
}

/** The notes as this suite talks about them: what sounds, where, and how it is written. */
function played(from: Score) {
  return notesOf(from).map((note) => ({
    pitch: note.pitch,
    spelling: note.spelling,
    start: note.start,
    duration: note.duration,
    hand: note.hand,
    voice: voiceOf(note),
    ...(note.finger === undefined ? {} : { finger: note.finger }),
    ...(note.articulation === undefined ? {} : { articulation: note.articulation }),
  }))
}

/** One `<note>`, with only the fields a test cares about spelled out. */
function note(
  step: string,
  octave: number,
  duration: number,
  extra: {
    alter?: number
    voice?: number
    staff?: number
    chord?: boolean
    tie?: 'start' | 'stop'
    inside?: string
  } = {},
): string {
  const alter = extra.alter === undefined ? '' : `<alter>${String(extra.alter)}</alter>`
  return `<note>
    ${extra.chord === true ? '<chord/>' : ''}
    <pitch><step>${step}</step>${alter}<octave>${String(octave)}</octave></pitch>
    <duration>${String(duration)}</duration>
    <voice>${String(extra.voice ?? 1)}</voice>
    <staff>${String(extra.staff ?? 1)}</staff>
    ${extra.tie === undefined ? '' : `<tie type="${extra.tie}"/>`}
    ${extra.inside ?? ''}
  </note>`
}

const QUARTERS = '<attributes><divisions>1</divisions></attributes>'

describe('importMusicXml', () => {
  it('reads notes onto the tick grid the divisions name', () => {
    const from = score(
      document({
        measures: `<measure number="1">
          <attributes><divisions>2</divisions></attributes>
          ${note('C', 4, 2)}${note('D', 4, 1)}${note('E', 4, 1)}
        </measure>`,
      }),
    )

    expect(timingOf(from).ticksPerQuarter).toBe(2)
    expect(played(from).map((one) => [one.pitch, one.start, one.duration])).toEqual([
      [60, 0, 2],
      [62, 2, 1],
      [64, 3, 1],
    ])
  })

  it('builds a grid every part can land on where they count differently', () => {
    const from = score(
      document({
        parts: `<score-part id="P1"><part-name>Right</part-name></score-part><score-part id="P2"><part-name>Left</part-name></score-part>`,
        measures: `<measure number="1"><attributes><divisions>3</divisions></attributes>${note('C', 4, 3)}</measure>`,
      }).replace(
        '</score-partwise>',
        `<part id="P2"><measure number="1"><attributes><divisions>4</divisions></attributes>${note('C', 3, 4)}</measure></part></score-partwise>`,
      ),
    )

    expect(timingOf(from).ticksPerQuarter).toBe(12)
    expect(played(from).map((one) => one.duration)).toEqual([12, 12])
  })

  it('keeps the spelling the file wrote, which is the whole point over MIDI', () => {
    const from = score(
      document({
        measures: `<measure number="1">${QUARTERS}${note('B', 4, 1, { alter: -1 })}${note('A', 3, 1, { alter: 1 })}${note('F', 4, 1, { alter: 2 })}</measure>`,
      }),
    )

    expect(played(from).map((one) => [one.pitch, one.spelling])).toEqual([
      [70, 'Bb4'],
      [58, 'A#3'],
      [67, 'F##4'],
    ])
  })

  it('sounds a quarter tone and leaves it unspelled rather than lying about it', () => {
    const from = score(
      document({
        measures: `<measure number="1">${QUARTERS}<note><pitch><step>C</step><alter>0.5</alter><octave>4</octave></pitch><duration>1</duration></note></measure>`,
      }),
    )

    expect(played(from)[0]).toMatchObject({ pitch: 61, spelling: undefined })
  })

  it('starts a chord tone with the note before it and does not advance time twice', () => {
    const from = score(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 1)}${note('E', 4, 1, { chord: true })}${note('G', 4, 1, { chord: true })}${note('B', 3, 1)}</measure>`,
      }),
    )

    expect(played(from).map((one) => [one.pitch, one.start])).toEqual([
      [60, 0],
      [64, 0],
      [67, 0],
      [59, 1],
    ])
  })

  it('takes the hand from the staff a note is written on', () => {
    const from = score(
      document({
        measures: `<measure number="1">
          <attributes><divisions>1</divisions><staves>2</staves>
            <clef number="1"><sign>G</sign></clef><clef number="2"><sign>F</sign></clef>
          </attributes>
          ${note('C', 5, 1, { staff: 1 })}
          <backup><duration>1</duration></backup>
          ${note('C', 3, 1, { staff: 2, voice: 5 })}
        </measure>`,
      }),
    )

    expect(played(from).map((one) => [one.pitch, one.hand])).toEqual([
      [48, 'left'],
      [72, 'right'],
    ])
  })

  it('takes the hand from the clef where a part is written on one staff', () => {
    const from = score(
      document({
        measures: `<measure number="1">
          <attributes><divisions>1</divisions><clef><sign>F</sign></clef></attributes>
          ${note('E', 5, 1)}
        </measure>`,
      }),
    )

    // Above middle C and still the left hand, because the bass clef says so.
    expect(played(from)[0]?.hand).toBe('left')
  })

  it('splits at middle C where nothing says which hand, and says that it guessed', () => {
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 5, 1)}${note('C', 3, 1)}</measure>`,
      }),
    )

    expect(played(result.score).map((one) => one.hand)).toEqual(['right', 'left'])
    expect(result.inferred).toContainEqual(expect.stringContaining('split between the hands'))
    expect(
      (result.score.extensions?.[MUSICXML_IMPORT_EXTENSION] as { inferred: Record<string, string> })
        .inferred['hand'],
    ).toContain('middle C')
  })

  it('keeps fingering and articulation, which MIDI cannot carry at all', () => {
    const from = score(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 1, {
          inside: `<notations><technical><fingering>3</fingering></technical><articulations><staccato/></articulations></notations>`,
        })}${note('D', 4, 1, {
          inside: `<notations><articulations><strong-accent/></articulations></notations>`,
        })}</measure>`,
      }),
    )

    expect(played(from)[0]).toMatchObject({ finger: 3, articulation: 'staccato' })
    expect(played(from)[1]).toMatchObject({ articulation: 'marcato' })
  })

  it('joins a tie into one longer note rather than striking the key twice', () => {
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 4, { tie: 'start' })}</measure>
          <measure number="2">${note('C', 4, 2, { tie: 'stop' })}${note('D', 4, 2)}</measure>`,
      }),
    )

    expect(played(result.score).map((one) => [one.pitch, one.start, one.duration])).toEqual([
      [60, 0, 6],
      [62, 6, 2],
    ])
    expect(result.inferred).toContainEqual(expect.stringContaining('tied note'))
  })

  it('reads two voices out of one measure, which is what backup is for', () => {
    const from = score(
      document({
        measures: `<measure number="1">
          <attributes><divisions>1</divisions></attributes>
          ${note('C', 5, 2, { voice: 1 })}
          <backup><duration>2</duration></backup>
          ${note('E', 4, 1, { voice: 2 })}${note('F', 4, 1, { voice: 2 })}
        </measure>`,
      }),
    )

    expect(played(from).map((one) => [one.pitch, one.start, one.voice])).toEqual([
      [64, 0, 1],
      [72, 0, 0],
      [65, 1, 1],
    ])
  })

  it('moves a note off a voice already sounding that key, and says how many', () => {
    const result = imported(
      document({
        measures: `<measure number="1">
          <attributes><divisions>1</divisions></attributes>
          ${note('C', 4, 4, { voice: 1 })}
          <backup><duration>4</duration></backup>
          ${note('C', 4, 1, { voice: 1 })}
        </measure>`,
      }),
    )

    expect(played(result.score).map((one) => one.voice)).toEqual([0, 1])
    expect(result.inferred).toContainEqual(expect.stringContaining('already sounding'))
  })

  it('reads the key, the meter and the tempo', () => {
    const from = score(
      document({
        measures: `<measure number="1">
          <attributes>
            <divisions>1</divisions>
            <key><fifths>-3</fifths><mode>minor</mode></key>
            <time><beats>6</beats><beat-type>8</beat-type></time>
          </attributes>
          <sound tempo="60"/>
          ${note('C', 4, 1)}
        </measure>`,
      }),
    )

    expect(from.metadata.key).toBe('C minor')
    expect(timingOf(from).timeSignatures).toEqual([{ tick: 0, numerator: 6, denominator: 8 }])
    expect(timingOf(from).tempo).toEqual([{ tick: 0, microsecondsPerQuarter: 1_000_000 }])
  })

  it('reads a metronome mark where no sound states the tempo', () => {
    const from = score(
      document({
        measures: `<measure number="1">${QUARTERS}
          <direction><direction-type><metronome><beat-unit>half</beat-unit><per-minute>60</per-minute></metronome></direction-type></direction>
          ${note('C', 4, 1)}
        </measure>`,
      }),
    )

    // A half note at 60 is a quarter at 120.
    expect(timingOf(from).tempo).toEqual([{ tick: 0, microsecondsPerQuarter: 500_000 }])
  })

  it('reads dynamics, and makes a wedge the ramp between the two around it', () => {
    const from = score(
      document({
        measures: `<measure number="1"><attributes><divisions>1</divisions></attributes>
          <direction><direction-type><dynamics><p/></dynamics></direction-type></direction>
          ${note('C', 4, 1)}
          <direction><direction-type><wedge type="crescendo"/></direction-type></direction>
          ${note('D', 4, 1)}
          <direction><direction-type><wedge type="stop"/></direction-type></direction>
          <direction><direction-type><dynamics><ff/></dynamics></direction-type></direction>
          ${note('E', 4, 1)}
        </measure>`,
      }),
    )

    expect(from.expression?.dynamics).toEqual([
      { tick: 0, level: 'p' },
      { tick: 2, level: 'ff', rampFrom: 'p', rampStart: 1 },
    ])
  })

  it('reads the pedal, and a change as up and straight back down', () => {
    const from = score(
      document({
        measures: `<measure number="1"><attributes><divisions>1</divisions></attributes>
          <direction><direction-type><pedal type="start"/></direction-type></direction>
          ${note('C', 4, 1)}
          <direction><direction-type><pedal type="change"/></direction-type></direction>
          ${note('D', 4, 1)}
          <direction><direction-type><pedal type="stop"/></direction-type></direction>
        </measure>`,
      }),
    )

    expect(from.expression?.pedals).toEqual([
      { tick: 0, pedal: 'sustain', value: 127 },
      { tick: 1, pedal: 'sustain', value: 0 },
      { tick: 1, pedal: 'sustain', value: 127 },
      { tick: 2, pedal: 'sustain', value: 0 },
    ])
  })

  it('plays a repeat out rather than drawing it, and says so', () => {
    const result = imported(
      document({
        measures: `<measure number="1"><attributes><divisions>1</divisions></attributes>
            <barline location="left"><repeat direction="forward"/></barline>
            ${note('C', 4, 4)}
          </measure>
          <measure number="2">${note('D', 4, 4)}
            <barline location="right"><repeat direction="backward"/></barline>
          </measure>`,
      }),
    )

    expect(played(result.score).map((one) => [one.pitch, one.start])).toEqual([
      [60, 0],
      [62, 4],
      [60, 8],
      [62, 12],
    ])
    expect(result.inferred).toContainEqual(expect.stringContaining('played out as 4 bars'))
  })

  it('takes the first ending on the first pass and the second on the second', () => {
    const from = score(
      document({
        measures: `<measure number="1"><attributes><divisions>1</divisions></attributes>
            <barline location="left"><repeat direction="forward"/></barline>
            ${note('C', 4, 4)}
          </measure>
          <measure number="2">
            <barline location="left"><ending number="1" type="start"/></barline>
            ${note('D', 4, 4)}
            <barline location="right"><ending number="1" type="stop"/><repeat direction="backward"/></barline>
          </measure>
          <measure number="3">
            <barline location="left"><ending number="2" type="start"/></barline>
            ${note('E', 4, 4)}
            <barline location="right"><ending number="2" type="discontinue"/></barline>
          </measure>`,
      }),
    )

    expect(played(from).map((one) => [one.pitch, one.start])).toEqual([
      [60, 0],
      [62, 4],
      [60, 8],
      [64, 12],
    ])
  })

  it('says when the expansion was cut rather than reaching the end', () => {
    // One bar repeating ten thousand times: a repeat structure like this is a
    // broken file and not a long piece, and the import stops. What it must not
    // do is stop quietly, leaving a score that validates and ends mid-phrase.
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}
            <barline location="left"><repeat direction="forward"/></barline>
            ${note('C', 4, 4)}
            <barline location="right"><repeat direction="backward" times="9999"/></barline>
          </measure>`,
      }),
    )

    expect(played(result.score)).toHaveLength(4000)
    expect(result.dropped).toEqual([
      'everything past bar 4000, where a repeat or a jump sent the reading back further than one import plays out',
    ])
  })

  it('says nothing about a ceiling a piece never reached', () => {
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}
            <barline location="left"><repeat direction="forward"/></barline>
            ${note('C', 4, 4)}
            <barline location="right"><repeat direction="backward" times="3"/></barline>
          </measure>`,
      }),
    )

    expect(played(result.score)).toHaveLength(3)
    expect(result.dropped).toEqual([])
  })

  it('follows a da capo al fine, stopping where the second pass is told to', () => {
    // Bars 1 2 3, Fine on 2, D.C. on 3: the piece is 1 2 3 1 2 and not 1 2 3.
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 4)}</measure>
          <measure number="2">${note('D', 4, 4)}<sound fine="yes"/></measure>
          <measure number="3">${note('E', 4, 4)}<sound dacapo="yes"/></measure>`,
      }),
    )

    expect(played(result.score).map((one) => [one.pitch, one.start])).toEqual([
      [60, 0],
      [62, 4],
      [64, 8],
      [60, 12],
      [62, 16],
    ])
    // Followed, so it is no longer something the import admits to leaving out.
    expect(result.dropped).toEqual([])
    expect(result.inferred).toContainEqual(
      expect.stringContaining('da capo and fine being followed'),
    )
  })

  it('ignores a fine on the way out, which is the whole of what it means', () => {
    // The same Fine with no D.C. anywhere: nothing sends the walk back, so it
    // plays to the end and the mark is reported rather than obeyed.
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 4)}<sound fine="yes"/></measure>
          <measure number="2">${note('D', 4, 4)}</measure>`,
      }),
    )

    expect(played(result.score).map((one) => one.pitch)).toEqual([60, 62])
    expect(result.dropped).toContainEqual(
      'the fine direction, which a reader follows and this import does not',
    )
  })

  it('follows a dal segno al coda from the sign to the coda', () => {
    // Segno on 2, to-coda on 3, D.S. on 4, coda on 5: plays 1 2 3 4 2 3 5. The
    // sign is not bar 1, so a jump landing there would be a da capo instead.
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 4)}</measure>
          <measure number="2">
            <direction><direction-type><segno/></direction-type><sound segno="A"/></direction>
            ${note('D', 4, 4)}
          </measure>
          <measure number="3">${note('E', 4, 4)}<sound tocoda="B"/></measure>
          <measure number="4">${note('F', 4, 4)}<sound dalsegno="A"/></measure>
          <measure number="5">
            <direction><direction-type><coda/></direction-type><sound coda="B"/></direction>
            ${note('G', 4, 4)}
          </measure>`,
      }),
    )

    expect(played(result.score).map((one) => one.pitch)).toEqual([60, 62, 64, 65, 62, 64, 67])
    expect(result.dropped).toEqual([])
  })

  it('leaves a dal segno alone where the file draws no sign to land on', () => {
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 4)}</measure>
          <measure number="2">${note('D', 4, 4)}<sound dalsegno="A"/></measure>`,
      }),
    )

    // Not read as a da capo: the beginning is not what the sign named, and a
    // piece silently doubled is worse than one that says what it skipped.
    expect(played(result.score).map((one) => one.pitch)).toEqual([60, 62])
    expect(result.dropped).toContainEqual(
      'the dal segno direction, which a reader follows and this import does not',
    )
  })

  it('does not take the repeats again on the way back from a da capo', () => {
    // 1 2 with a repeat, 3 with the D.C.: 1 2 1 2 3, then 1 2 3 and not the
    // repeat a second time. An engraver writing D.C. means senza repetizione.
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}
            <barline location="left"><repeat direction="forward"/></barline>
            ${note('C', 4, 4)}
          </measure>
          <measure number="2">${note('D', 4, 4)}
            <barline location="right"><repeat direction="backward"/></barline>
          </measure>
          <measure number="3">${note('E', 4, 4)}<sound dacapo="yes"/></measure>`,
      }),
    )

    expect(played(result.score).map((one) => one.pitch)).toEqual([60, 62, 60, 62, 64, 60, 62, 64])
  })

  it('takes a da capo once, so a piece that jumps back ends rather than loops', () => {
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 4)}</measure>
          <measure number="2">${note('D', 4, 4)}<sound dacapo="yes"/></measure>`,
      }),
    )

    expect(played(result.score).map((one) => one.pitch)).toEqual([60, 62, 60, 62])
  })

  it('reads a timewise document as the same score a partwise one is', () => {
    const partwise = score(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 1)}</measure><measure number="2">${note('D', 4, 1)}</measure>`,
      }),
    )
    const timewise = score(`<?xml version="1.0"?>
      <score-timewise version="4.0">
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <measure number="1"><part id="P1">${QUARTERS}${note('C', 4, 1)}</part></measure>
        <measure number="2"><part id="P1">${note('D', 4, 1)}</part></measure>
      </score-timewise>`)

    expect(played(timewise)).toEqual(played(partwise))
  })

  it('names every part the file names, and puts each note in its own', () => {
    const from = score(
      document({
        parts: `<score-part id="P1"><part-name>Right hand</part-name></score-part><score-part id="P2"><part-name>Left hand</part-name></score-part>`,
        measures: `<measure number="1">${QUARTERS}${note('C', 5, 1)}</measure>`,
      }).replace(
        '</score-partwise>',
        `<part id="P2"><measure number="1">${QUARTERS}${note('C', 3, 1)}</measure></part></score-partwise>`,
      ),
    )

    expect(from.parts?.map((part) => part.name)).toEqual(['Right hand', 'Left hand'])
    expect(notesOf(from).map((one) => [one.pitch, partOf(one)])).toEqual([
      [48, 'part-2'],
      [72, 'part-1'],
    ])
  })

  it('takes the title from the work, since that is the field for it', () => {
    const from = score(
      document({
        head: '<work><work-title>The Piece</work-title></work>',
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 1)}</measure>`,
      }),
    )

    expect(from.metadata.title).toBe('The Piece')
  })

  it('falls back to the name it was given, and then to something', () => {
    const measures = `<measure number="1">${QUARTERS}${note('C', 4, 1)}</measure>`

    expect(score(document({ measures })).metadata.title).toBe('Imported MusicXML')
    expect(imported(document({ measures }), 'gymnopedie 1').score.metadata.title).toBe(
      'gymnopedie 1',
    )
  })

  it('reads the composer and the arranger', () => {
    const from = score(
      document({
        head: `<identification><creator type="composer">Erik Satie</creator><creator type="arranger">Someone Else</creator></identification>`,
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 1)}</measure>`,
      }),
    )

    expect(from.metadata.composer).toBe('Erik Satie')
    expect(from.metadata.arranger).toBe('Someone Else')
  })

  it('reports a rights notice and records no provenance from it', () => {
    const result = imported(
      document({
        head: '<identification><rights>© 1999 Somebody</rights></identification>',
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 1)}</measure>`,
      }),
    )

    expect(result.score.metadata.provenance).toBeUndefined()
    expect(result.dropped).toContainEqual(
      expect.stringContaining('licence is recorded by a person'),
    )
  })

  it('reads a pickup as a pickup rather than as a short first bar', () => {
    const from = score(
      document({
        measures: `<measure number="0" implicit="yes"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${note('G', 4, 1)}</measure>
          <measure number="1">${note('C', 4, 4)}</measure>`,
      }),
    )

    expect(timingOf(from).pickupTicks).toBe(1)
  })

  it('lists what it left behind, one sentence each', () => {
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}
          <note><grace/><pitch><step>B</step><octave>3</octave></pitch><voice>1</voice></note>
          <note><cue/><pitch><step>B</step><octave>3</octave></pitch><duration>1</duration></note>
          ${note('C', 4, 1, { inside: '<lyric><text>la</text></lyric><notations><ornaments><trill-mark/></ornaments><slur type="start"/><articulations><spiccato/></articulations></notations>' })}
          <direction><direction-type><words>rit.</words></direction-type></direction>
          <direction><direction-type><dynamics><sf/></dynamics></direction-type></direction>
        </measure>`,
      }),
    )

    expect(result.dropped).toEqual([
      '1 grace note, which are written with no length of their own',
      '1 cue note, which are printed rather than played',
      '1 lyric',
      '1 written direction, such as a tempo word or a rehearsal mark',
      '1 ornament; a trill sounds as the note it is written on',
      '1 slur; phrasing is not stored per note',
      '1 articulation other than staccato, tenuto, accent and marcato',
      '1 dynamic mark such as sf or fp, which name an event rather than a level',
    ])
  })

  it('reports a key change rather than pretending a score has two keys', () => {
    const result = imported(
      document({
        measures: `<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key></attributes>${note('C', 4, 1)}</measure>
          <measure number="2"><attributes><key><fifths>2</fifths></key></attributes>${note('D', 4, 1)}</measure>`,
      }),
    )

    expect(result.score.metadata.key).toBe('C major')
    expect(result.dropped).toContainEqual(expect.stringContaining('1 key change'))
  })

  it('drops an unpitched part, because this app plays one piano', () => {
    const result = imported(
      document({
        measures: `<measure number="1">${QUARTERS}${note('C', 4, 1)}<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>1</duration></note></measure>`,
      }),
    )

    expect(played(result.score)).toHaveLength(1)
    expect(result.dropped).toContainEqual(expect.stringContaining('1 unpitched note'))
  })

  it('refuses what is not XML, saying so rather than throwing', () => {
    const result = importMusicXml('this is not markup')

    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.message).toMatch(/holds no element/)
  })

  it('refuses XML that is not MusicXML, naming what it opened with', () => {
    const result = importMusicXml('<html><body/></html>')

    expect(result.ok ? '' : result.message).toMatch(/opens with <html>/)
  })

  it('refuses a document with no measures in it', () => {
    const result = importMusicXml(document({ measures: '' }).replace('<part id="P1">', '<part>'))

    expect(result.ok ? '' : result.message).toMatch(/holds no music/)
  })
})
