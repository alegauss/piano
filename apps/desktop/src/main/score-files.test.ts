import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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
      expect(path.endsWith('.score.json')).toBe(true)
    }
  })

  it('takes the score a command line names, and not the app or a flag', () => {
    const cwd = resolve('/music')
    expect(launchPath(['Piano.exe', '--flag', 'nocturne.score.json'], cwd)).toBe(
      resolve(cwd, 'nocturne.score.json'),
    )
    expect(launchPath(['electron', '.'], cwd)).toBeNull()
    expect(launchPath(['Piano.exe', '--allow-file-access=a.json'], cwd)).toBeNull()
    expect(launchPath(['Piano.exe', 'one.mid', 'two.json'], cwd)).toBe(resolve(cwd, 'two.json'))
  })
})
