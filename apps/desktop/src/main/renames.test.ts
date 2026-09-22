import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { fileRenames, noRenames } from './renames'

/**
 * What a correction made while the app was closed left behind, read from a
 * real file: it is collected once, and nothing in it is ever a reason to fail.
 */

let directory = ''
const file = () => join(directory, 'renames.json')

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'piano-renames-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('the notes a correction leaves', () => {
  it('reads back what was left', async () => {
    await writeFile(
      file(),
      JSON.stringify({ moves: [{ was: 'title:Untitled', now: 'prelude-in-c' }] }),
      'utf8',
    )
    expect(await fileRenames(file()).pending()).toEqual([
      { was: 'title:Untitled', now: 'prelude-in-c' },
    ])
  })

  it('is taken away once it has been applied, so nothing moves twice', async () => {
    await writeFile(file(), JSON.stringify({ moves: [{ was: 'a', now: 'b' }] }), 'utf8')
    const renames = fileRenames(file())

    await renames.done()

    expect(await renames.pending()).toEqual([])
    await expect(readFile(file(), 'utf8')).rejects.toThrow()
  })

  it('answers nothing where there is no file, which is every ordinary launch', async () => {
    expect(await fileRenames(file()).pending()).toEqual([])
    // Nothing to take away is not a failure either.
    await expect(fileRenames(file()).done()).resolves.toBeUndefined()
  })

  it('answers nothing for a file nothing can read, rather than failing the launch', async () => {
    await writeFile(file(), '{ torn', 'utf8')
    expect(await fileRenames(file()).pending()).toEqual([])

    await writeFile(file(), JSON.stringify({ moves: [{ was: 1 }] }), 'utf8')
    expect(await fileRenames(file()).pending()).toEqual([])
  })

  it('has a shape for the app that was never closed', async () => {
    const none = noRenames()
    expect(await none.pending()).toEqual([])
    await expect(none.done()).resolves.toBeUndefined()
  })
})
