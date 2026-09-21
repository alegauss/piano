import { describe, expect, it } from 'vitest'

import {
  appRecordSchema,
  needsWindow,
  commandSchema,
  envelopeSchema,
  isPresenceFile,
  LINK_PROTOCOL,
  presenceFileName,
  presenceSchema,
  protocolMismatch,
} from './link'

/**
 * The contract between the app and the MCP server, asked what it lets
 * through: exactly the eight commands, from a window that says where it is.
 */

const presence = {
  protocol: LINK_PROTOCOL,
  endpoint: 'http://127.0.0.1:52100',
  token: 'a'.repeat(48),
  pid: 4242,
  focusedAt: 1000,
  app: '0.0.0',
}

describe('a presence file', () => {
  it('says where the window listens and how to prove who is asking', () => {
    expect(presenceSchema.parse(presence)).toEqual(presence)
  })

  it('is refused without an address or with a token anybody could guess', () => {
    expect(presenceSchema.safeParse({ ...presence, endpoint: 'not a url' }).success).toBe(false)
    expect(presenceSchema.safeParse({ ...presence, token: 'short' }).success).toBe(false)
  })

  it('is named for its process, so two apps never write the same one', () => {
    expect(presenceFileName(4242)).toBe('window-4242.json')
    expect(isPresenceFile(presenceFileName(4242))).toBe(true)
    expect(isPresenceFile('library.json')).toBe(false)
    expect(isPresenceFile('window-../../x.json')).toBe(false)
  })
})

describe('the commands', () => {
  it.each([
    [{ kind: 'play' }],
    [{ kind: 'play', score: 'prelude' }],
    [{ kind: 'stop' }],
    [{ kind: 'seek', bar: 17 }],
    [{ kind: 'seek', section: 'chorus' }],
    [{ kind: 'tempo', scale: 0.5 }],
    [{ kind: 'transpose', semitones: -3 }],
    [{ kind: 'level', level: 'beginner' }],
    [{ kind: 'state' }],
    [{ kind: 'practise', drill: { passage: { kind: 'bars', from: 17, to: 20 }, hands: ['left'] } }],
  ])('lets %j through', (command) => {
    expect(commandSchema.safeParse(command).success).toBe(true)
  })

  it.each([
    [{ kind: 'run', script: 'rm -rf /' }],
    [{ kind: 'tempo', scale: 40 }],
    [{ kind: 'level', level: 'grandmaster' }],
    [{ kind: 'practise', drill: { passage: { kind: 'ticks', start: 0, end: 1 } } }],
  ])('refuses %j', (command) => {
    expect(commandSchema.safeParse(command).success).toBe(false)
  })

  it('leaves the command unread until the version has been checked', () => {
    const envelope = envelopeSchema.parse({ protocol: 99, command: { kind: 'from the future' } })
    expect(envelope.protocol).toBe(99)
  })
})

describe('what is worth a window', () => {
  it('is anything that makes a sound or a change, and not a question about what is open', () => {
    expect(needsWindow({ kind: 'play' })).toBe(true)
    expect(needsWindow({ kind: 'practise' })).toBe(true)
    expect(needsWindow({ kind: 'level' })).toBe(true)
    expect(needsWindow({ kind: 'state' })).toBe(false)
  })

  it('reads where an installed app lives', () => {
    expect(
      appRecordSchema.safeParse({ executable: 'C:/Piano/Piano.exe', version: '1.0.0' }).success,
    ).toBe(true)
    expect(appRecordSchema.safeParse({ executable: '', version: '1' }).success).toBe(false)
  })
})

describe('two versions meeting', () => {
  it('says which side is behind, so the right thing gets updated', () => {
    const plugin = protocolMismatch({ us: 'plugin', ours: 2, them: 'piano app', theirs: 1 })
    expect(plugin).toContain('Update the piano app')

    const app = protocolMismatch({ us: 'piano app', ours: 2, them: 'plugin', theirs: 1 })
    expect(app).toContain('Update the plugin')
  })

  it('names each side by the release a person can find, where it is known', () => {
    const said = protocolMismatch({
      us: 'plugin',
      ours: 1,
      ourRelease: '0.1.0',
      them: 'piano app',
      theirs: 2,
      theirRelease: '0.2.0',
    })
    expect(said).toContain('plugin (0.1.0) speaks version 1')
    expect(said).toContain('piano app (0.2.0) speaks version 2')
    expect(said).toContain('Update the plugin')
  })
})
