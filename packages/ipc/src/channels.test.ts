import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  allChannels,
  appInfo,
  formatIssues,
  libraryList,
  librarySave,
  packDownload,
  packFile,
  packManifest,
  packSource,
  scoreExport,
  scoreKeepArrangement,
  scoreOpen,
  scoreRecent,
  windowSetTitle,
} from './channels'
import { CHANNEL_NAMES } from './names'

describe('the channel contract', () => {
  it('declares every channel exactly once', () => {
    const names = allChannels.map((channel) => channel.channel)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps the names module and the schemas in step', () => {
    // The preload imports only the names, so a channel renamed in one place
    // and not the other fails at runtime in whichever screen calls it first.
    expect(allChannels.map((c) => c.channel).sort()).toEqual(Object.values(CHANNEL_NAMES).sort())
  })

  it('gives every channel a request and a response schema', () => {
    for (const channel of allChannels) {
      expect(channel.request).toBeInstanceOf(z.ZodType)
      expect(channel.response).toBeInstanceOf(z.ZodType)
    }
  })
})

describe('window:set-title', () => {
  it('accepts a title', () => {
    expect(windowSetTitle.request.parse({ title: 'Piano' })).toEqual({ title: 'Piano' })
  })

  it.each([
    ['a number', { title: 123 }],
    ['nothing at all', {}],
    ['null', null],
    ['an empty string', { title: '' }],
    ['a title longer than the limit', { title: 'x'.repeat(201) }],
  ])('refuses %s', (_label, payload) => {
    expect(windowSetTitle.request.safeParse(payload).success).toBe(false)
  })
})

describe('app:info', () => {
  it('takes no payload', () => {
    expect(appInfo.request.safeParse(null).success).toBe(true)
    expect(appInfo.request.safeParse({ anything: true }).success).toBe(false)
  })

  it('requires every version field on the way out', () => {
    expect(appInfo.response.safeParse({ electron: '44', chrome: '152', node: '24' }).success).toBe(
      false,
    )
    const versions = { electron: '44', chrome: '152', node: '24', scoreFormatVersion: 1 }
    expect(appInfo.response.safeParse({ ...versions, app: '0.1.0' }).success).toBe(true)
    // The release is the one a person is sent to look for, so it is never left out.
    expect(appInfo.response.safeParse(versions).success).toBe(false)
  })
})

describe('pack:manifest', () => {
  it('says where it looked when no pack is installed', () => {
    expect(
      packManifest.response.safeParse({ installed: false, location: '/profile/sample-pack' })
        .success,
    ).toBe(true)
    expect(packManifest.response.safeParse({ installed: false }).success).toBe(false)
  })

  it('passes an installed manifest through for the renderer to check', () => {
    expect(
      packManifest.response.safeParse({ installed: true, manifest: { any: 'json' } }).success,
    ).toBe(true)
  })
})

describe('pack:file', () => {
  it('accepts a recording path as the manifest spells one', () => {
    expect(packFile.request.safeParse({ path: 'samples/Ds1-v8.ogg' }).success).toBe(true)
    expect(packFile.request.safeParse({ path: 'releases/60.ogg' }).success).toBe(true)
  })

  it.each([
    ['a climb out of the pack', '../../package.json'],
    ['a climb hidden inside the folder', 'samples/../manifest.json'],
    ['an absolute path', '/etc/passwd'],
    ['a Windows path', 'C:\\Windows\\win.ini'],
    ['a backslash climb', 'samples\\..\\..\\secret.ogg'],
    ['the manifest itself', 'manifest.json'],
    ['another kind of file', 'samples/C4-v8.exe'],
    ['nothing', ''],
  ])('refuses %s', (_label, path) => {
    expect(packFile.request.safeParse({ path }).success).toBe(false)
  })

  it('answers with bytes', () => {
    expect(packFile.response.safeParse({ bytes: new Uint8Array([1, 2]) }).success).toBe(true)
    expect(packFile.response.safeParse({ bytes: [1, 2] }).success).toBe(false)
  })
})

describe('score:open', () => {
  it.each([
    ['the dialog', { from: 'dialog' }],
    ['a dropped file', { from: 'dropped', path: '/home/ada/aria.json' }],
    ['a recent file', { from: 'recent', path: 'C:\\Music\\aria.json' }],
    ['a library id', { from: 'library', id: 'bwv-846' }],
    ['what the app was launched with', { from: 'launch' }],
  ])('accepts %s', (_label, request) => {
    expect(scoreOpen.request.safeParse(request).success).toBe(true)
  })

  it.each([
    ['a source nobody declared', { from: 'anywhere', path: '/etc/passwd' }],
    ['a drop with no path', { from: 'dropped' }],
    ['an empty library id', { from: 'library', id: '' }],
    ['a library id longer than any title', { from: 'library', id: 'x'.repeat(201) }],
    ['nothing', null],
  ])('refuses %s', (_label, request) => {
    expect(scoreOpen.request.safeParse(request).success).toBe(false)
  })

  it('answers opened, refused with its reasons, or nothing', () => {
    const { response } = scoreOpen
    expect(
      response.safeParse({ kind: 'opened', name: 'a.json', score: {}, notices: [] }).success,
    ).toBe(true)
    expect(
      response.safeParse({ kind: 'refused', name: 'a.json', message: 'no', problems: [] }).success,
    ).toBe(true)
    expect(response.safeParse({ kind: 'none' }).success).toBe(true)
    expect(response.safeParse({ kind: 'refused', name: 'a.json' }).success).toBe(false)
  })
})

describe('score:recent', () => {
  it('lists entries with a path, a file name and a title', () => {
    expect(
      scoreRecent.response.safeParse([{ path: '/m/a.json', name: 'a.json', title: 'A' }]).success,
    ).toBe(true)
    expect(scoreRecent.response.safeParse([{ path: '', name: 'a.json', title: 'A' }]).success).toBe(
      false,
    )
  })
})

describe('library:list', () => {
  it('takes a search, a level, tags, a composer and an order, all optional', () => {
    expect(libraryList.request.safeParse({}).success).toBe(true)
    expect(
      libraryList.request.safeParse({
        text: 'ode',
        level: 'beginner',
        tags: ['classical'],
        composer: 'Beethoven',
        order: 'newest',
      }).success,
    ).toBe(true)
  })

  it.each([
    ['a level nobody declared', { level: 'expert' }],
    ['an order nobody declared', { order: 'loudest' }],
    ['a search longer than anybody types', { text: 'x'.repeat(201) }],
    ['nothing', null],
  ])('refuses %s', (_label, query) => {
    expect(libraryList.request.safeParse(query).success).toBe(false)
  })
})

describe('library:save', () => {
  it('carries the score and nothing that names a file, which the library decides', () => {
    const { request } = librarySave
    expect(request.safeParse({ score: {} }).success).toBe(true)
    expect(request.safeParse({ score: {}, id: 'somewhere-else' }).success).toBe(false)
    expect(request.safeParse({ score: {}, path: 'C:/elsewhere.piano' }).success).toBe(false)
    expect(request.safeParse(null).success).toBe(false)
  })

  it('answers filed with the id it went in under, or refused with why', () => {
    const { response } = librarySave
    expect(response.safeParse({ kind: 'filed', id: 'aria', title: 'Aria' }).success).toBe(true)
    expect(response.safeParse({ kind: 'refused', message: 'no' }).success).toBe(true)
    // The id is what opens it again, so it is never left out.
    expect(response.safeParse({ kind: 'filed', title: 'Aria' }).success).toBe(false)
  })
})

describe('the sample pack download', () => {
  it('states the size before anything is fetched, or why there is nothing to fetch', () => {
    expect(
      packSource.response.safeParse({
        available: true,
        id: 'salamander',
        version: 2,
        bytes: 15_000_000,
        files: 210,
      }).success,
    ).toBe(true)
    expect(packSource.response.safeParse({ available: false, reason: 'nowhere' }).success).toBe(
      true,
    )
    expect(packSource.response.safeParse({ available: true }).success).toBe(false)
  })

  it('takes nothing from the page: where it downloads from is main’s to know', () => {
    expect(packDownload.request.safeParse(null).success).toBe(true)
    expect(packDownload.request.safeParse({ url: 'https://evil.example/' }).success).toBe(false)
  })
})

describe('score:export', () => {
  it('carries the score and the level it is played at, and no path', () => {
    expect(scoreExport.request.safeParse({ score: {}, level: null }).success).toBe(true)
    expect(scoreExport.request.safeParse({ score: {}, level: 'beginner' }).success).toBe(true)
    expect(scoreExport.request.safeParse({ score: {}, level: 'expert' }).success).toBe(false)
    expect(scoreExport.request.safeParse({ score: {} }).success).toBe(false)
  })

  it('answers saved with what was left out, cancelled, or refused with why', () => {
    const { response } = scoreExport
    expect(response.safeParse({ kind: 'saved', name: 'a.mid', dropped: [] }).success).toBe(true)
    expect(response.safeParse({ kind: 'cancelled' }).success).toBe(true)
    expect(response.safeParse({ kind: 'refused', message: 'no' }).success).toBe(true)
    expect(response.safeParse({ kind: 'saved', name: 'a.mid' }).success).toBe(false)
  })
})

describe('score:keep-arrangement', () => {
  it('carries the arrangement and nothing that names a file, which main already knows', () => {
    const { request } = scoreKeepArrangement
    expect(request.safeParse({ arrangement: { id: 'x', level: 'beginner' } }).success).toBe(true)
    expect(request.safeParse({}).success).toBe(false)
    expect(request.safeParse({ arrangement: {}, path: 'C:/elsewhere.json' }).success).toBe(false)
  })

  it('answers kept with the score as written, or refused with why', () => {
    const { response } = scoreKeepArrangement
    expect(response.safeParse({ kind: 'kept', name: 'a.score.json', score: {} }).success).toBe(true)
    expect(response.safeParse({ kind: 'refused', message: 'no' }).success).toBe(true)
    expect(response.safeParse({ kind: 'kept', score: {} }).success).toBe(false)
  })
})

describe('formatIssues', () => {
  it('names the field and the reason, because a model reads this next', () => {
    const result = windowSetTitle.request.safeParse({ title: 123 })
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }
    const message = formatIssues(result.error)
    expect(message).toContain('title')
    expect(message).toMatch(/expected string/i)
  })

  it('calls the whole payload <root> when the failure is not in a field', () => {
    const result = windowSetTitle.request.safeParse(null)
    expect(result.success).toBe(false)
    if (result.success) {
      return
    }
    expect(formatIssues(result.error)).toContain('<root>')
  })
})
