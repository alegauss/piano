import type { RecentEntry } from '@piano/ipc'
import type { MenuItemConstructorOptions } from 'electron'

/**
 * The application menu, as data.
 *
 * Opening a file is where anyone looks first, so it gets the shortcut every
 * other program uses and the recent list goes under it. The rest is Electron's
 * own roles, which is what keeps copy, paste and the macOS app menu behaving
 * the way the platform does. Kept apart from Electron's Menu so what it offers
 * can be asserted without starting one.
 */

export type MenuActions = {
  readonly open: () => void
  readonly openRecent: (path: string) => void
  readonly clearRecent: () => void
}

export function menuTemplate(
  platform: string,
  recent: readonly RecentEntry[],
  actions: MenuActions,
): MenuItemConstructorOptions[] {
  const recentItems: MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: 'Nothing opened yet', enabled: false }]
      : recent.map((entry) => ({
          // The title is what somebody remembers; the file name tells two of one title apart.
          label: `${entry.title} — ${entry.name}`,
          click: () => {
            actions.openRecent(entry.path)
          },
        }))

  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'Open…',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          actions.open()
        },
      },
      {
        label: 'Open Recent',
        submenu: [
          ...recentItems,
          { type: 'separator' },
          {
            label: 'Clear Recent',
            enabled: recent.length > 0,
            click: () => {
              actions.clearRecent()
            },
          },
        ],
      },
      { type: 'separator' },
      platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
    ],
  }

  return [
    ...(platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
    file,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]
}
