import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { KEEP_RENAMES, renamesSchema } from '@piano/ipc'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fileRenames, noRenames } from './renames'

/**
 * The note a correction leaves when the app is closed, written to a real
 * file: it accumulates, it stays readable, and it is never worth failing a
 * tool call over.
 */

let directory = ''
const file = () => join(directory, 'renames.json')
const held = async () => renamesSchema.parse(JSON.parse(await readFile(file(), 'utf8'))).moves

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-mcp-renames-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('leaving a note for the app', () => {
  it('writes down where a piece’s records moved to', async () => {
    await fileRenames(file()).moved({ was: 'title:Untitled', now: 'prelude-in-c' })
    expect(await held()).toEqual([{ was: 'title:Untitled', now: 'prelude-in-c' }])
  })

  it('keeps the notes already there, since the app may have been closed all week', async () => {
    const renames = fileRenames(file())
    await renames.moved({ was: 'title:One', now: 'one' })
    await renames.moved({ was: 'title:Two', now: 'two' })
    expect(await held()).toHaveLength(2)
  })

  it('writes nothing where the key did not move, which is most corrections', async () => {
    await fileRenames(file()).moved({ was: 'aria', now: 'aria' })
    await expect(readFile(file(), 'utf8')).rejects.toThrow()
  })

  it('keeps one note per piece, the newest, so a piece corrected twice moves once', async () => {
    const renames = fileRenames(file())
    await renames.moved({ was: 'title:Untitled', now: 'prelude' })
    await renames.moved({ was: 'title:Untitled', now: 'prelude-in-c' })
    expect(await held()).toEqual([{ was: 'title:Untitled', now: 'prelude-in-c' }])
  })

  it('starts again from a file nothing can read, rather than refusing the correction', async () => {
    await writeFile(file(), '{ torn', 'utf8')
    await fileRenames(file()).moved({ was: 'title:One', now: 'one' })
    expect(await held()).toEqual([{ was: 'title:One', now: 'one' }])
  })

  it('drops the oldest past the cap, so the file cannot grow without end', async () => {
    const renames = fileRenames(file())
    for (let index = 0; index < KEEP_RENAMES + 2; index += 1) {
      await renames.moved({ was: `title:${String(index)}`, now: String(index) })
    }
    const moves = await held()
    expect(moves).toHaveLength(KEEP_RENAMES)
    expect(moves[0]?.was).toBe('title:2')
  })

  it('has a shape for a caller with nowhere to write, which writes nothing', async () => {
    await expect(noRenames().moved({ was: 'a', now: 'b' })).resolves.toBeUndefined()
  })
})
