import { describe, expect, it } from 'vitest'

import {
  LEGACY_SCORE_SUFFIX,
  libraryFileName,
  libraryFileNames,
  libraryIdOfFile,
  safeName,
  SCORE_SUFFIX,
} from './library'

/**
 * One rule for what a library score is called, read by the server that saves
 * it and the app that opens it. What the MCP server's own tests check of it
 * holds here too, because it is the same function.
 */

describe('the file a library id names', () => {
  it('is the id reduced to a safe name, with the score suffix', () => {
    expect(libraryFileName('BWV 846')).toBe(`bwv-846${SCORE_SUFFIX}`)
  })

  it('carries one extension of its own, so a system can be told to open it with the piano', () => {
    expect(SCORE_SUFFIX).toBe('.piano')
    expect(SCORE_SUFFIX.split('.')).toHaveLength(2)
  })

  it('never climbs out of the library or names a device', () => {
    for (const id of ['../../x', '/etc/passwd', 'C:\\Windows\\win.ini', 'con', 'NUL']) {
      const name = libraryFileName(id)
      expect(name).toMatch(/^[a-z0-9-]+\.piano$/)
      expect(name).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)\./)
    }
    expect(safeName('')).toBe('score')
  })

  it('is looked for under the name it is written as first, then the one it had before', () => {
    expect(libraryFileNames('Ode')).toEqual(['ode.piano', 'ode.score.json'])
  })
})

describe('the id a file holds', () => {
  it('reads either suffix, and nothing else', () => {
    expect(libraryIdOfFile('ode.piano')).toBe('ode')
    expect(libraryIdOfFile(`ode${LEGACY_SCORE_SUFFIX}`)).toBe('ode')
    expect(libraryIdOfFile('ode.json')).toBeNull()
    expect(libraryIdOfFile('.index.json')).toBeNull()
    expect(libraryIdOfFile('.piano')).toBeNull()
  })
})
