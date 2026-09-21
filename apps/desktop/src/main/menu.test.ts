import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it } from 'vitest'

import { menuTemplate } from './menu'
import { isInternal } from './navigation'

/**
 * The menu as data, and which addresses the window may show. Both are about
 * opening a file: the shortcut every program uses, the list of what was
 * opened lately, and a dropped file never replacing the app with its text.
 */

function items(menu: MenuItemConstructorOptions | undefined): MenuItemConstructorOptions[] {
  const submenu = menu?.submenu
  return Array.isArray(submenu) ? submenu : []
}

function fileMenu(template: MenuItemConstructorOptions[]) {
  return template.find((one) => one.label === 'File')
}

describe('the application menu', () => {
  const done: string[] = []
  const actions = {
    open: () => done.push('open'),
    openRecent: (path: string) => done.push(`recent ${path}`),
    clearRecent: () => done.push('clear'),
    exportMidi: () => done.push('export'),
  }

  it('saves the open score as MIDI from the same menu, with the usual export shortcut', () => {
    const save = items(fileMenu(menuTemplate('win32', [], actions))).find(
      (one) => one.label === 'Save as MIDI…',
    )
    expect(save?.accelerator).toBe('CmdOrCtrl+E')
    save?.click?.(undefined as never, undefined, undefined as never)
    expect(done).toContain('export')
  })

  it('opens a file with the shortcut every other program uses', () => {
    const open = items(fileMenu(menuTemplate('win32', [], actions))).find(
      (one) => one.label === 'Open…',
    )
    expect(open?.accelerator).toBe('CmdOrCtrl+O')
    open?.click?.(undefined as never, undefined, undefined as never)
    expect(done).toContain('open')
  })

  it('lists what was opened lately under it, newest first, each opening its own file', () => {
    const recent = [
      { path: '/music/b.json', name: 'b.json', title: 'Bourrée' },
      { path: '/music/a.json', name: 'a.json', title: 'Aria' },
    ]
    const list = items(
      items(fileMenu(menuTemplate('darwin', recent, actions))).find(
        (one) => one.label === 'Open Recent',
      ),
    )
    expect(list.slice(0, 2).map((one) => one.label)).toEqual(['Bourrée — b.json', 'Aria — a.json'])
    list[1]?.click?.(undefined as never, undefined, undefined as never)
    expect(done).toContain('recent /music/a.json')
    expect(list.at(-1)).toMatchObject({ label: 'Clear Recent', enabled: true })
  })

  it('says there is nothing yet rather than showing an empty list', () => {
    const list = items(
      items(fileMenu(menuTemplate('linux', [], actions))).find(
        (one) => one.label === 'Open Recent',
      ),
    )
    expect(list[0]).toMatchObject({ label: 'Nothing opened yet', enabled: false })
    expect(list.at(-1)).toMatchObject({ label: 'Clear Recent', enabled: false })
  })
})

describe('what the window may show', () => {
  const page = 'file:///C:/Program%20Files/Piano/resources/app.asar/dist/renderer/index.html'

  it('shows its own page, wherever within it', () => {
    expect(isInternal(page, undefined, page)).toBe(true)
    expect(isInternal(`${page}#roll`, undefined, page)).toBe(true)
  })

  it('never shows a file somebody dropped, which would replace the app with its text', () => {
    expect(isInternal('file:///C:/Users/ada/Music/nocturne.score.json', undefined, page)).toBe(
      false,
    )
    expect(isInternal('file:///etc/passwd', undefined, page)).toBe(false)
  })

  it('shows the dev server in development, and nothing else from the web', () => {
    expect(isInternal('http://localhost:5173/src/App.tsx', 'http://localhost:5173', page)).toBe(
      true,
    )
    expect(isInternal('https://example.com/', 'http://localhost:5173', page)).toBe(false)
    expect(isInternal('https://example.com/', undefined, page)).toBe(false)
  })
})
