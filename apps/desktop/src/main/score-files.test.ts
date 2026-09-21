import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { deflateRawSync } from 'node:zlib'

import { exportMidi, notesOf, type Score } from '@piano/score-format'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isOpenable, launchPath, libraryPath, MAX_SCORE_BYTES, openScoreFile } from './score-files'

/**
 * Reading a score off a real disk, which is the one road every way of
 * opening one takes. The claims: a score the format accepts comes back typed,
 * anything else comes back as reasons, and nothing is read that is not a
 * score or a MIDI file of a sane size.
 */

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-open-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const minimal: Score = {
  formatVersion: 1,
  metadata: { title: 'Little tune' },
  notes: [60, 64, 67].map((pitch, index) => ({
    pitch,
    start: index * 480,
    duration: 480,
    velocity: 80,
  })),
}

async function file(name: string, contents: string | Uint8Array): Promise<string> {
  const path = join(directory, name)
  await writeFile(path, contents)
  return path
}

/** Three notes with the spelling and the fingering a MIDI file could not have carried. */
const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Three notes</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes><divisions>1</divisions><clef><sign>G</sign></clef></attributes>
    ${[
      ['C', 0, 1],
      ['E', -1, 2],
      ['G', 0, 5],
    ]
      .map(
        ([step, alter, finger]) =>
          `<note><pitch><step>${String(step)}</step><alter>${String(alter)}</alter><octave>4</octave></pitch><duration>1</duration><notations><technical><fingering>${String(finger)}</fingering></technical></notations></note>`,
      )
      .join('')}
  </measure></part>
</score-partwise>`

/** The same document as a .mxl: a zip holding a container and the score, deflated. */
function compressed(xml: string): Uint8Array {
  const container = Buffer.from(
    '<container><rootfiles><rootfile full-path="score.xml"/></rootfiles></container>',
  )
  const entries = [
    { name: 'META-INF/container.xml', raw: container },
    { name: 'score.xml', raw: Buffer.from(xml) },
  ].map((entry) => ({ ...entry, packed: deflateRawSync(entry.raw) }))

  const out: number[] = []
  const directoryBytes: number[] = []
  const push = (into: number[], value: number, width: number): void => {
    for (let index = 0; index < width; index += 1) {
      into.push((value >>> (index * 8)) & 0xff)
    }
  }

  for (const entry of entries) {
    const name = [...Buffer.from(entry.name)]
    const offset = out.length
    push(out, 0x04034b50, 4)
    push(out, 20, 2)
    push(out, 0, 2)
    push(out, 8, 2)
    push(out, 0, 4)
    push(out, 0, 4)
    push(out, entry.packed.length, 4)
    push(out, entry.raw.length, 4)
    push(out, name.length, 2)
    push(out, 0, 2)
    out.push(...name, ...entry.packed)

    push(directoryBytes, 0x02014b50, 4)
    push(directoryBytes, 20, 2)
    push(directoryBytes, 20, 2)
    push(directoryBytes, 0, 2)
    push(directoryBytes, 8, 2)
    push(directoryBytes, 0, 4)
    push(directoryBytes, 0, 4)
    push(directoryBytes, entry.packed.length, 4)
    push(directoryBytes, entry.raw.length, 4)
    push(directoryBytes, name.length, 2)
    push(directoryBytes, 0, 2)
    push(directoryBytes, 0, 2)
    push(directoryBytes, 0, 2)
    push(directoryBytes, 0, 2)
    push(directoryBytes, 0, 4)
    push(directoryBytes, offset, 4)
    directoryBytes.push(...name)
  }

  const directoryAt = out.length
  out.push(...directoryBytes)
  push(out, 0x06054b50, 4)
  push(out, 0, 2)
  push(out, 0, 2)
  push(out, entries.length, 2)
  push(out, entries.length, 2)
  push(out, directoryBytes.length, 4)
  push(out, directoryAt, 4)
  push(out, 0, 2)
  return Uint8Array.from(out)
}

describe('opening a score file', () => {
  it('returns a score the format accepts, named as the file is', async () => {
    const opened = await openScoreFile(await file('prelude.score.json', JSON.stringify(minimal)))
    expect(opened.kind).toBe('opened')
    expect(opened.name).toBe('prelude.score.json')
    if (opened.kind === 'opened') {
      expect(opened.score.metadata.title).toBe(minimal.metadata.title)
    }
  })

  it('reads past the byte-order mark some editors write first', async () => {
    const opened = await openScoreFile(await file('bom.json', `\uFEFF${JSON.stringify(minimal)}`))
    expect(opened.kind).toBe('opened')
  })

  it('refuses a score the format does not, naming each problem with its fix', async () => {
    const broken = { ...minimal, notes: [{ pitch: 200, start: 0, duration: 10, velocity: 80 }] }
    const opened = await openScoreFile(await file('broken.json', JSON.stringify(broken)))
    expect(opened.kind).toBe('refused')
    if (opened.kind === 'refused') {
      expect(opened.problems.length).toBeGreaterThan(0)
      expect(opened.problems[0]?.path).toContain('pitch')
      expect(opened.message).toContain('pitch')
    }
  })

  it('says a file that is not JSON is not JSON, rather than failing somewhere later', async () => {
    const opened = await openScoreFile(await file('notes.json', '{ "formatVersion": 1, '))
    expect(opened).toMatchObject({ kind: 'refused', name: 'notes.json', problems: [] })
    if (opened.kind === 'refused') {
      expect(opened.message).toContain('not JSON')
    }
  })

  it('imports a MIDI file, and says what it guessed rather than hiding it', async () => {
    const midi = exportMidi(minimal)
    const opened = await openScoreFile(await file('little_tune.mid', midi.bytes))
    expect(opened.kind).toBe('opened')
    if (opened.kind === 'opened') {
      expect(notesOf(opened.score).map((note) => note.pitch)).toEqual([60, 64, 67])
      expect(opened.notices.every((line) => /^(Guessed|Left out): /.test(line))).toBe(true)
    }
  })

  it('refuses bytes that call themselves MIDI and are not', async () => {
    const opened = await openScoreFile(await file('fake.mid', 'not a midi file at all'))
    expect(opened.kind).toBe('refused')
    if (opened.kind === 'refused') {
      expect(opened.message).toContain('not a MIDI file')
    }
  })

  it('reads nothing that is neither a score nor a MIDI file', async () => {
    const opened = await openScoreFile(await file('secrets.txt', JSON.stringify(minimal)))
    expect(opened.kind).toBe('refused')
    expect(isOpenable('C:/Windows/win.ini')).toBe(false)
    expect(isOpenable('/home/ada/piece.MID')).toBe(true)
    expect(isOpenable('/home/ada/piece.Piano')).toBe(true)
    expect(isOpenable('/home/ada/piece.MusicXML')).toBe(true)
  })

  it('imports MusicXML, keeping what the file wrote down about it', async () => {
    const opened = await openScoreFile(await file('three_notes.musicxml', MUSICXML))
    expect(opened.kind).toBe('opened')
    if (opened.kind === 'opened') {
      expect(opened.score.metadata.title).toBe('Three notes')
      expect(notesOf(opened.score).map((note) => note.spelling)).toEqual(['C4', 'Eb4', 'G4'])
      expect(notesOf(opened.score).map((note) => note.finger)).toEqual([1, 2, 5])
    }
  })

  it('unpacks a .mxl, which is the shape most sites hand MusicXML out in', async () => {
    const opened = await openScoreFile(await file('three_notes.mxl', compressed(MUSICXML)))
    expect(opened.kind).toBe('opened')
    if (opened.kind === 'opened') {
      expect(notesOf(opened.score).map((note) => note.pitch)).toEqual([60, 63, 67])
    }
  })

  it('refuses an .xml that turns out to be some other XML, saying which', async () => {
    const opened = await openScoreFile(await file('feed.xml', '<rss><channel/></rss>'))
    expect(opened.kind).toBe('refused')
    if (opened.kind === 'refused') {
      expect(opened.message).toContain('not MusicXML')
    }
  })

  it('refuses a .mxl that is not an archive at all', async () => {
    const opened = await openScoreFile(await file('broken.mxl', 'PK\u0003\u0004 and then nothing'))
    expect(opened.kind).toBe('refused')
    if (opened.kind === 'refused') {
      expect(opened.message).toContain('not MusicXML')
    }
  })

  it('reads a .piano file as the score it is', async () => {
    const opened = await openScoreFile(await file('prelude.piano', JSON.stringify(minimal)))
    expect(opened).toMatchObject({ kind: 'opened', name: 'prelude.piano' })
  })

  it('leaves alone a file far bigger than any score', async () => {
    const opened = await openScoreFile(await file('huge.json', ' '.repeat(MAX_SCORE_BYTES + 1)))
    expect(opened.kind).toBe('refused')
    if (opened.kind === 'refused') {
      expect(opened.message).toContain('MB')
    }
  })

  it('says a file has gone rather than throwing', async () => {
    const opened = await openScoreFile(join(directory, 'moved-away.json'))
    expect(opened).toMatchObject({ kind: 'refused', name: 'moved-away.json' })
  })

  it('refuses a folder with a score’s name', async () => {
    await mkdir(join(directory, 'folder.json'))
    const opened = await openScoreFile(join(directory, 'folder.json'))
    expect(opened.kind).toBe('refused')
  })
})

describe('where a library id and a launch point', () => {
  it('keeps a library id inside the library, whatever it says', () => {
    const root = join(directory, 'library')
    for (const id of ['../../outside', '/etc/passwd', 'C:\\Windows\\win.ini', '..', 'con']) {
      const path = libraryPath(root, id)
      expect(resolve(path).startsWith(resolve(root))).toBe(true)
      expect(path.endsWith('.piano')).toBe(true)
    }
  })

  it('finds a library score saved before the suffix changed, where it has not moved', () => {
    const root = join(directory, 'library')
    const old = join(root, 'aria.score.json')
    expect(libraryPath(root, 'aria', (path) => path === old)).toBe(old)
    const both = new Set([old, join(root, 'aria.piano')])
    expect(libraryPath(root, 'aria', (path) => both.has(path))).toBe(join(root, 'aria.piano'))
  })

  it('takes the score a command line names, and not the app or a flag', () => {
    const cwd = resolve('/music')
    expect(launchPath(['Piano.exe', '--flag', 'nocturne.piano'], cwd)).toBe(
      resolve(cwd, 'nocturne.piano'),
    )
    expect(launchPath(['Piano.exe', 'nocturne.score.json'], cwd)).toBe(
      resolve(cwd, 'nocturne.score.json'),
    )
    expect(launchPath(['electron', '.'], cwd)).toBeNull()
    expect(launchPath(['Piano.exe', '--allow-file-access=a.json'], cwd)).toBeNull()
    expect(launchPath(['Piano.exe', 'one.mid', 'two.json'], cwd)).toBe(resolve(cwd, 'two.json'))
  })

  it('takes a file a desktop entry hands over as a file:// URL', () => {
    const cwd = resolve('/music')
    const path = resolve('/music/Nocturne No 1.piano')
    expect(launchPath(['piano', pathToFileURL(path).href], cwd)).toBe(path)
    // A URL that names no file on this machine is not a file to open.
    expect(launchPath(['piano', 'file:///music/a%2Fb.piano'], cwd)).toBeNull()
  })
})
