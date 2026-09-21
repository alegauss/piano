import { describe, expect, it } from 'vitest'

import { candidates, findApp, whereLooked, type Place } from './launch'

/**
 * Where the app is looked for, on each platform, with the machine faked. The
 * claims: an explicit setting wins, then where the app last ran, then the
 * installer's defaults, and nothing that is not there is ever started.
 */

function place(over: Partial<Place> & { readonly present?: readonly string[] } = {}): Place {
  const present = new Set(over.present ?? [])
  const files: Record<string, string> = {}
  return {
    platform: 'win32',
    home: 'C:/Users/ada',
    env: { LOCALAPPDATA: 'C:\\Users\\ada\\AppData\\Local', ProgramFiles: 'C:\\Program Files' },
    exists: (path) => present.has(path),
    read: (path) => files[path] ?? null,
    ...over,
  }
}

const recorded = (executable: string) => (path: string) =>
  path === 'C:/Users/ada/.piano/app.json' ? JSON.stringify({ executable, version: '1.0.0' }) : null

describe('where the app is looked for', () => {
  it('believes an explicit setting first, then where the app last ran, then the defaults', () => {
    const paths = candidates(
      place({
        env: { PIANO_APP: 'D:/Piano.exe', LOCALAPPDATA: 'L' },
        read: recorded('E:/Piano/Piano.exe'),
      }),
    ).map((one) => one.path)
    expect(paths).toEqual(['D:/Piano.exe', 'E:/Piano/Piano.exe', 'L\\Programs\\Piano\\Piano.exe'])
  })

  it('finds the per-user install Windows puts it in by default', () => {
    const found = findApp(
      place({ present: ['C:\\Users\\ada\\AppData\\Local\\Programs\\Piano\\Piano.exe'] }),
    )
    expect(found).toEqual({
      command: 'C:\\Users\\ada\\AppData\\Local\\Programs\\Piano\\Piano.exe',
      args: [],
      from: 'the default install location',
    })
  })

  it('follows an install somebody moved, through what the app recorded', () => {
    const found = findApp(
      place({ read: recorded('E:/Tools/Piano/Piano.exe'), present: ['E:/Tools/Piano/Piano.exe'] }),
    )
    expect(found?.from).toBe('where the app last ran')
  })

  it('opens an application bundle on macOS rather than running it', () => {
    const found = findApp(
      place({
        platform: 'darwin',
        home: '/Users/ada',
        env: {},
        present: ['/Applications/Piano.app'],
      }),
    )
    expect(found).toEqual({
      command: 'open',
      args: ['-a', '/Applications/Piano.app'],
      from: 'Applications',
    })
  })

  it('starts nothing that is not there, and says where it looked', () => {
    const nowhere = place()
    expect(findApp(nowhere)).toBeNull()
    expect(whereLooked(nowhere)).toContain('Programs\\Piano\\Piano.exe')
  })

  it('ignores a record it cannot read', () => {
    const paths = candidates(place({ env: {}, read: () => '{"broken":' })).map((one) => one.path)
    expect(paths).toEqual([])
  })
})
