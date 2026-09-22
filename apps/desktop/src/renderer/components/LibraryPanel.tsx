import type { LibraryItem, LibraryLeft, LibraryQuery } from '@piano/ipc'
import { FolderOpen, Library as LibraryIcon, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '../lib/cn'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

/**
 * The library, on screen.
 *
 * Two hundred scores is a month of asking Claude Code for pieces, so this is
 * a list that narrows: words from the title or the composer, a level, and a
 * tag or a composer picked from a row. Newest first by default, because the
 * piece somebody wants is usually the one they just asked for; easiest first
 * is one click away. It is asked for afresh whenever something changes —
 * what is typed, what is picked, or a score arriving in the folder while it
 * is open — and the answer comes from the same index Claude Code's tools
 * read, so a list here and a list in the chat are the same list.
 *
 * The library has two ways in now, and an empty list is the one place
 * somebody is certainly looking: ask Claude Code for a piece, or bring in a
 * file already on the disk. The second is offered as the door itself rather
 * than described, because somebody who has just found an empty library is not
 * going to go looking for a button in the header on the strength of a
 * sentence about one.
 */

type Level = NonNullable<LibraryQuery['level']>
type Order = NonNullable<LibraryQuery['order']>

const LEVELS: readonly { readonly value: Level | null; readonly label: string }[] = [
  { value: null, label: 'Any level' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

/** Minutes and seconds, as a list says how long something lasts. */
export function clock(seconds: number): string {
  const whole = Math.round(seconds)
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`
}

export function LibraryPanel({
  search,
  changes,
  onOpen,
  onOpenFile,
  leftBehind,
  onOpenLeft,
}: {
  readonly search: (query: LibraryQuery) => Promise<LibraryItem[]>
  /** Told when the folder changes; returns the way to stop being told. */
  readonly changes: (listener: () => void) => () => void
  readonly onOpen: (id: string) => void
  /** The other way in: open a file already on the disk, and file it from there. */
  readonly onOpenFile: () => void
  /** What is in the folder and never became a score, asked for with the list. */
  readonly leftBehind: () => Promise<LibraryLeft[]>
  /** Open one of those by name, which only works for a file that reads. */
  readonly onOpenLeft: (name: string) => void
}) {
  const [showing, setShowing] = useState(false)
  const [text, setText] = useState('')
  const [level, setLevel] = useState<Level | null>(null)
  const [order, setOrder] = useState<Order>('newest')
  const [tag, setTag] = useState<string | null>(null)
  const [composer, setComposer] = useState<string | null>(null)
  const [items, setItems] = useState<readonly LibraryItem[] | null>(null)
  const [left, setLeft] = useState<readonly LibraryLeft[]>([])
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!showing) {
      return
    }
    return changes(() => {
      setRevision((was) => was + 1)
    })
  }, [showing, changes])

  useEffect(() => {
    if (!showing) {
      return
    }
    let current = true
    const query: LibraryQuery = {
      order,
      ...(text.trim() === '' ? {} : { text: text.trim() }),
      ...(level === null ? {} : { level }),
      ...(tag === null ? {} : { tags: [tag] }),
      ...(composer === null ? {} : { composer }),
    }
    void search(query).then(
      (found) => {
        if (current) {
          setItems(found)
        }
      },
      () => {
        if (current) {
          setItems([])
        }
      },
    )
    return () => {
      current = false
    }
  }, [showing, text, level, order, tag, composer, revision, search])

  // Asked for beside the list, and again whenever the folder changes: a file
  // copied in is taken in or left behind in the same moment.
  useEffect(() => {
    if (!showing) {
      return
    }
    let current = true
    void leftBehind().then(
      (found) => {
        if (current) {
          setLeft(found)
        }
      },
      () => {
        if (current) {
          setLeft([])
        }
      },
    )
    return () => {
      current = false
    }
  }, [showing, revision, leftBehind])

  const narrowed = text.trim() !== '' || level !== null || tag !== null || composer !== null

  return (
    <Dialog open={showing} onOpenChange={setShowing}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setShowing(true)
        }}
      >
        <LibraryIcon />
        Library
      </Button>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Library</DialogTitle>
          <DialogDescription>
            Every score saved from Claude Code, added from a file you opened, or copied into the
            library folder.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <input
            type="search"
            aria-label="Search the library"
            placeholder="Title or composer"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
            }}
            className="h-9 rounded-(--radius) border border-border-subtle bg-surface-base px-3 text-sm text-text-default placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
          <div className="flex flex-wrap items-center gap-2">
            {LEVELS.map((one) => (
              <Button
                key={one.label}
                variant={level === one.value ? 'secondary' : 'ghost'}
                size="sm"
                aria-pressed={level === one.value}
                onClick={() => {
                  setLevel(one.value)
                }}
              >
                {one.label}
              </Button>
            ))}
            <span className="ml-auto flex gap-1">
              {(['newest', 'easiest'] as const).map((one) => (
                <Button
                  key={one}
                  variant={order === one ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={order === one}
                  onClick={() => {
                    setOrder(one)
                  }}
                >
                  {one === 'newest' ? 'Newest first' : 'Easiest first'}
                </Button>
              ))}
            </span>
          </div>
          {tag === null && composer === null ? null : (
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ...(tag === null ? [] : [{ label: `Tag: ${tag}`, clear: () => setTag(null) }]),
                ...(composer === null
                  ? []
                  : [{ label: `Composer: ${composer}`, clear: () => setComposer(null) }]),
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  aria-label={`Stop filtering by ${chip.label}`}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-raised px-2 py-0.5 text-text-default hover:text-text-strong"
                  onClick={chip.clear}
                >
                  {chip.label}
                  <X className="size-3" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-auto">
          {items === null ? (
            <p className="px-2 py-3 text-sm text-text-muted">Looking…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-start gap-2 px-2 py-3">
              <p className="text-sm text-text-muted">
                {narrowed
                  ? 'Nothing in the library matches.'
                  : 'The library is empty. Ask Claude Code for a piece with /piano:compose, or bring in a file you already have.'}
              </p>
              {narrowed ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowing(false)
                    onOpenFile()
                  }}
                >
                  <FolderOpen />
                  Open a file
                </Button>
              )}
            </div>
          ) : (
            <ul aria-label="Scores in the library" className="flex flex-col">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-(--radius) px-2 py-2 hover:bg-surface-raised"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col text-left focus-visible:outline-2 focus-visible:outline-accent"
                    onClick={() => {
                      setShowing(false)
                      onOpen(item.id)
                    }}
                  >
                    <span className="truncate text-sm font-medium text-text-strong">
                      {item.title}
                    </span>
                    <span className="truncate text-xs text-text-muted">
                      {[
                        item.level,
                        item.difficulty === undefined ? undefined : `${String(item.difficulty)}/10`,
                        clock(item.seconds),
                      ]
                        .filter((part) => part !== undefined)
                        .join(' · ')}
                    </span>
                  </button>
                  {/*
                   * Capped at half the row: a composer is a sentence in a
                   * score written for this app, not a name, and chips that
                   * refused to give ground left the title nothing to show.
                   */}
                  <span className="flex max-w-[50%] flex-wrap justify-end gap-1 text-xs">
                    {item.composer === undefined ? null : (
                      <FilterChip
                        label={item.composer}
                        what="composer"
                        onPick={() => {
                          setComposer(item.composer ?? null)
                        }}
                      />
                    )}
                    {item.tags.map((one) => (
                      <FilterChip
                        key={one}
                        label={one}
                        what="tag"
                        onPick={() => {
                          setTag(one)
                        }}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {left.length === 0 ? null : (
          <LeftBehind
            left={left}
            onOpen={(name) => {
              setShowing(false)
              onOpenLeft(name)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * What is lying in the folder and never became a score.
 *
 * Under the list rather than in it: these are not pieces, and a row that
 * cannot be played does not belong among rows that can. Folded away, because
 * on most days there is nothing here and the count is the whole story.
 *
 * A file that reads is offered as a door: what stopped it was its name
 * colliding with a piece already filed, and that is a question the filing form
 * asks once the piece is open.
 */
function LeftBehind({
  left,
  onOpen,
}: {
  readonly left: readonly LibraryLeft[]
  readonly onOpen: (name: string) => void
}) {
  return (
    <details className="mt-3 shrink-0 border-t border-border-subtle pt-3 text-sm">
      <summary className="cursor-pointer text-text-muted">
        {left.length === 1
          ? 'One file in the folder was not taken in'
          : `${String(left.length)} files in the folder were not taken in`}
      </summary>
      <ul aria-label="Files the library did not take in" className="mt-2 flex flex-col gap-2">
        {left.map((one) => (
          <li key={one.name} className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-text-default">{one.name}</span>
              <span className="text-xs text-text-muted">{one.why}</span>
            </span>
            {one.opens ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpen(one.name)
                }}
              >
                Open it
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  )
}

function FilterChip({
  label,
  what,
  onPick,
}: {
  readonly label: string
  readonly what: 'tag' | 'composer'
  readonly onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`Only scores with the ${what} ${label}`}
      title={label}
      className={cn(
        'min-w-0 max-w-full truncate rounded-full px-2 py-0.5 hover:text-text-strong',
        what === 'composer' ? 'text-text-default' : 'bg-surface-overlay text-text-muted',
      )}
      onClick={onPick}
    >
      {label}
    </button>
  )
}
