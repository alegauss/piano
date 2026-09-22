import { createLibrary, memoryFiles } from '@piano/library'
import { parseScore, type Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { createInbox, SETTLE_MS } from './library-inbox'
import type { Opened, Refused } from './score-files'

/**
 * The library folder as an inbox, with the disk in a map and the reader a
 * function the test writes: what gets imported, what is left where it is, and
 * what a second sweep does about both.
 */

const root = '/library'

const scoreFor = (title: string): Score => ({
  formatVersion: 1,
  metadata: { title },
  notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
})

/** Opens anything the test seeded, as the real reader would after importing it. */
function reader(titles: Readonly<Record<string, string>>) {
  const asked: string[] = []
  const open = (path: string): Promise<Opened | Refused> => {
    asked.push(path)
    const name = path.slice(root.length + 1)
    const title = titles[name]
    return Promise.resolve(
      title === undefined
        ? {
            kind: 'refused',
            name,
            message: `${name} is not a MIDI file this app can read`,
            problems: [],
          }
        : { kind: 'opened', name, score: scoreFor(title), notices: [] },
    )
  }
  return { asked, open }
}

function inboxOver(
  seeded: Readonly<Record<string, string>>,
  titles: Readonly<Record<string, string>>,
  now = () => SETTLE_MS * 100,
) {
  const files = memoryFiles(seeded)
  const library = createLibrary(root, files)
  const { asked, open } = reader(titles)
  return { files, library, asked, inbox: createInbox({ root, files, library, open, now }) }
}

describe('taking in what was copied into the library folder', () => {
  it('imports a MIDI file and files it as a score beside it', async () => {
    const { files, library, inbox } = inboxOver(
      { [`${root}/prelude.mid`]: 'MThd…' },
      { 'prelude.mid': 'Prelude' },
    )

    const swept = await inbox.sweep()

    expect(swept.filed).toEqual([{ name: 'prelude.mid', id: 'prelude' }])
    // The original is somebody's file, not the app's: it stays where it is.
    expect(files.held.has(`${root}/prelude.mid`)).toBe(true)
    const written = files.held.get(`${root}/prelude.piano`)
    expect(written).toBeDefined()
    expect(parseScore(JSON.parse(written ?? '')).ok).toBe(true)
    expect((await library.list()).map((entry) => entry.metadata.title)).toEqual(['Prelude'])
  })

  it('leaves a score file alone: it is already in the library', async () => {
    const { asked, inbox } = inboxOver(
      { [`${root}/aria.piano`]: JSON.stringify(scoreFor('Aria')) },
      {},
    )
    await inbox.sweep()
    expect(asked).toEqual([])
  })

  it('reads each file once, however often it sweeps', async () => {
    const { asked, inbox } = inboxOver(
      { [`${root}/prelude.mid`]: 'MThd…' },
      { 'prelude.mid': 'Prelude' },
    )

    await inbox.sweep()
    const second = await inbox.sweep()

    expect(asked).toEqual([`${root}/prelude.mid`])
    expect(second.filed).toEqual([])
  })

  it('remembers what it could not read, and tries again once the file changes', async () => {
    const { files, asked, inbox } = inboxOver({ [`${root}/broken.mid`]: 'not midi' }, {})

    const swept = await inbox.sweep()
    expect(swept.filed).toEqual([])
    expect(swept.left[0]?.name).toBe('broken.mid')
    await inbox.sweep()
    expect(asked).toHaveLength(1)

    // The rest of the copy arrives: a new size, so it is read again.
    await files.write(`${root}/broken.mid`, 'MThd…')
    await inbox.sweep()
    expect(asked).toHaveLength(2)
  })

  it('leaves a file whose id the library already holds, and says so', async () => {
    const { files, library, inbox } = inboxOver(
      { [`${root}/prelude.mid`]: 'MThd…' },
      { 'prelude.mid': 'Prelude' },
    )
    await library.save(scoreFor('Prelude'))

    const swept = await inbox.sweep()

    expect(swept.filed).toEqual([])
    expect(swept.left).toEqual([{ name: 'prelude.mid', why: 'the library already has a prelude' }])
    // Nothing numbered was written: nobody is here to be asked which piece wins.
    expect(files.held.has(`${root}/prelude-2.piano`)).toBe(false)
  })

  it('cannot duplicate a library when its own record is lost', async () => {
    const { files, inbox } = inboxOver(
      { [`${root}/prelude.mid`]: 'MThd…' },
      { 'prelude.mid': 'Prelude' },
    )
    await inbox.sweep()
    files.held.delete(`${root}/.imported.json`)

    const swept = await inbox.sweep()

    expect(swept.filed).toEqual([])
    expect(files.held.has(`${root}/prelude-2.piano`)).toBe(false)
  })

  it('waits for a file that was written a moment ago rather than reading it half copied', async () => {
    const files = memoryFiles({ [`${root}/prelude.mid`]: 'MThd…' })
    const library = createLibrary(root, files)
    const { asked, open } = reader({ 'prelude.mid': 'Prelude' })
    // The map's clock is small; a caller whose clock has barely started sees
    // every file as one written a moment ago.
    let clock = 0
    const inbox = createInbox({ root, files, library, open, now: () => clock })

    const swept = await inbox.sweep()
    expect(swept.waiting).toBe(1)
    expect(asked).toEqual([])
    // Nothing was recorded, so the sweep that comes back does look at it.
    clock = SETTLE_MS * 100
    expect((await inbox.sweep()).filed).toEqual([{ name: 'prelude.mid', id: 'prelude' }])
  })

  it('shares one sweep between callers, since the watcher hears its own writes', async () => {
    const { asked, inbox } = inboxOver(
      { [`${root}/prelude.mid`]: 'MThd…' },
      { 'prelude.mid': 'Prelude' },
    )

    const [one, other] = await Promise.all([inbox.sweep(), inbox.sweep()])

    expect(one).toBe(other)
    expect(asked).toEqual([`${root}/prelude.mid`])
  })
})
