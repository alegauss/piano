import type { OpenRequest, RecentEntry } from '@piano/ipc'
import { FolderOpen, History } from 'lucide-react'
import { useState } from 'react'

import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

/**
 * Opening a score from the window itself: the dialog, and the pieces opened
 * lately. The menu and its shortcut do the same through main; these are here
 * because a menu bar that hides itself is not where anybody finds anything.
 *
 * The list is asked for each time it opens rather than kept, so a score
 * opened from the menu or by a drop is on it the next time somebody looks.
 */
export function OpenControls({
  open,
  recent,
}: {
  readonly open: (request: Exclude<OpenRequest, { from: 'dropped' }>) => void
  readonly recent: () => Promise<RecentEntry[]>
}) {
  const [entries, setEntries] = useState<readonly RecentEntry[] | null>(null)
  const [showing, setShowing] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <Popover
        open={showing}
        onOpenChange={(next) => {
          setShowing(next)
          if (next) {
            setEntries(null)
            void recent().then(setEntries, () => {
              setEntries([])
            })
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <History />
            Recent
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-2" aria-label="Recent scores">
          {entries === null ? (
            <p className="px-2 py-1.5 text-sm text-text-muted">Looking…</p>
          ) : entries.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-text-muted">
              Nothing opened yet. Open a score, or drop one on the window.
            </p>
          ) : (
            <ul className="flex flex-col">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    className="flex w-full flex-col rounded-(--radius) px-2 py-1.5 text-left hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-accent"
                    title={entry.path}
                    onClick={() => {
                      setShowing(false)
                      open({ from: 'recent', path: entry.path })
                    }}
                  >
                    <span className="text-sm text-text-strong">{entry.title}</span>
                    <span className="text-xs text-text-muted">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          open({ from: 'dialog' })
        }}
      >
        <FolderOpen />
        Open…
      </Button>
    </div>
  )
}
