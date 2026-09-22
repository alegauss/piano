import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { OpenRequest, OpenResult, RecentEntry } from '@piano/ipc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createOpener } from './opener'
import { createRecent } from './recent'
import { openScoreFile } from './score-files'

/**
 * Every way of opening a score, against real files. The claim that matters
 * is that they are one road: the same file refused through the dialog, a
 * drop, the recent list, the library and a launch is refused in the same
 * words, and only a score that opened is ever remembered.
 */

let directory = ''

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-opener-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

const valid = {
  formatVersion: 1,
  metadata: { title: 'Little tune' },
  notes: [{ pitch: 60, start: 0, duration: 480, velocity: 80 }],
}

const broken = {
  formatVersion: 1,
  metadata: { title: 'Broken' },
  notes: [{ pitch: 200, start: 0, duration: 480, velocity: 80 }],
}

async function setup(chosen: string | null = null, launched: string | null = null) {
  const library = join(directory, 'library')
  await mkdir(library, { recursive: true })
  const recent = createRecent(join(directory, 'profile', 'recent.json'))
  const remembered: RecentEntry[] = []
  let launch = launched
  const opener = createOpener({
    read: openScoreFile,
    recent,
    choose: () => Promise.resolve(chosen),
    libraryRoot: () => library,
    launched: () => {
      const file = launch
      launch = null
      return file
    },
    remembered: (_entries, opened) => {
      remembered.push(opened)
    },
  })
  return { opener, recent, library, remembered }
}

async function write(path: string, score: unknown): Promise<string> {
  await writeFile(path, JSON.stringify(score))
  return path
}

describe('one road for every way of opening a score', () => {
  it('refuses the same file in the same words, whichever way it came', async () => {
    const library = join(directory, 'library')
    await mkdir(library, { recursive: true })
    const path = await write(join(library, 'broken.piano'), broken)
    const { opener, recent } = await setup(path, path)
    // The recent list only offers what it holds, so the file is put on it the
    // way an earlier, valid version of it would have been.
    await recent.add({ path, name: 'broken.piano', title: 'Broken' })

    const requests: OpenRequest[] = [
      { from: 'dialog' },
      { from: 'dropped', path },
      { from: 'recent', path },
      { from: 'library', id: 'broken' },
      { from: 'launch' },
    ]
    const answers: OpenResult[] = []
    for (const request of requests) {
      answers.push(await opener.open(request))
    }

    expect(answers[0]?.kind).toBe('refused')
    for (const answer of answers) {
      expect(answer).toEqual(answers[0])
    }
  })

  it('remembers a score that opened, and never one that did not', async () => {
    const good = await write(join(directory, 'good.json'), valid)
    const bad = await write(join(directory, 'bad.json'), broken)
    const { opener, recent, remembered } = await setup()

    expect((await opener.open({ from: 'dropped', path: good })).kind).toBe('opened')
    expect((await opener.open({ from: 'dropped', path: bad })).kind).toBe('refused')

    expect(remembered.map((one) => one.title)).toEqual(['Little tune'])
    expect((await recent.list()).map((one) => one.path)).toEqual([good])
  })

  it('says which file a score came from, and nothing for one refused', async () => {
    const good = await write(join(directory, 'good.json'), valid)
    const bad = await write(join(directory, 'bad.json'), broken)
    const from: string[] = []
    const opener = createOpener({
      read: openScoreFile,
      recent: createRecent(join(directory, 'profile', 'recent.json')),
      choose: () => Promise.resolve(null),
      libraryRoot: () => directory,
      launched: () => null,
      opened: (path) => from.push(path),
    })
    await opener.open({ from: 'dropped', path: bad })
    await opener.open({ from: 'dropped', path: good })
    expect(from).toEqual([good])
  })

  it('opens again from the recent list only what the list holds', async () => {
    const good = await write(join(directory, 'good.json'), valid)
    const elsewhere = await write(join(directory, 'never-opened.json'), valid)
    const { opener } = await setup()
    await opener.open({ from: 'dropped', path: good })

    expect((await opener.open({ from: 'recent', path: good })).kind).toBe('opened')
    const refused = await opener.open({ from: 'recent', path: elsewhere })
    expect(refused).toMatchObject({ kind: 'refused', name: 'never-opened.json' })
  })

  it('opens a library score by the id Claude Code saved it under', async () => {
    const { opener, library } = await setup()
    await write(join(library, 'little-tune.piano'), valid)
    const opened = await opener.open({ from: 'library', id: 'Little Tune' })
    expect(opened).toMatchObject({ kind: 'opened', name: 'little-tune.piano' })

    // One saved before scores were called .piano opens by its id all the same.
    await write(join(library, 'old-tune.score.json'), valid)
    const old = await opener.open({ from: 'library', id: 'old-tune' })
    expect(old).toMatchObject({ kind: 'opened', name: 'old-tune.score.json' })

    const missing = await opener.open({ from: 'library', id: 'nocturne' })
    expect(missing).toMatchObject({ kind: 'refused' })
    if (missing.kind === 'refused') {
      expect(missing.message).toContain('"nocturne"')
    }
  })

  it('opens a file the library folder holds by name, and nothing outside it', async () => {
    const { opener, library } = await setup()
    await write(join(library, 'untaken.json'), valid)
    expect(await opener.open({ from: 'folder', name: 'untaken.json' })).toMatchObject({
      kind: 'opened',
      name: 'untaken.json',
    })

    const gone = await opener.open({ from: 'folder', name: 'never-there.mid' })
    expect(gone).toMatchObject({ kind: 'refused' })
    if (gone.kind === 'refused') {
      expect(gone.message).toContain('not in the library folder')
    }
  })

  it('opens nothing when the dialog is closed, or the app was started with no file', async () => {
    const { opener } = await setup(null, null)
    expect(await opener.open({ from: 'dialog' })).toEqual({ kind: 'none' })
    expect(await opener.open({ from: 'launch' })).toEqual({ kind: 'none' })
  })

  it('hands over what the app was launched with once, and then nothing', async () => {
    const good = await write(join(directory, 'good.json'), valid)
    const { opener } = await setup(null, good)
    expect((await opener.open({ from: 'launch' })).kind).toBe('opened')
    expect(await opener.open({ from: 'launch' })).toEqual({ kind: 'none' })
  })
})
