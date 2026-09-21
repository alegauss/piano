import { describe, expect, it } from 'vitest'

import { libraryFileName, safeName, SCORE_SUFFIX } from './library'

/**
 * One rule for what a library score is called, read by the server that saves
 * it and the app that opens it. What the MCP server's own tests check of it
 * holds here too, because it is the same function.
 */

describe('the file a library id names', () => {
  it('is the id reduced to a safe name, with the score suffix', () => {
    expect(libraryFileName('BWV 846')).toBe(`bwv-846${SCORE_SUFFIX}`)
  })

  it('never climbs out of the library or names a device', () => {
    for (const id of ['../../x', '/etc/passwd', 'C:\\Windows\\win.ini', 'con', 'NUL']) {
      const name = libraryFileName(id)
      expect(name).toMatch(/^[a-z0-9-]+\.score\.json$/)
      expect(name).not.toMatch(/^(con|prn|aux|nul|com\d|lpt\d)\./)
    }
    expect(safeName('')).toBe('score')
  })
})
