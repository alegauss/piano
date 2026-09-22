import type {
  LibraryCorrectResult,
  LibraryItem,
  LibraryLeft,
  LibraryQuery,
  LibraryRemoveResult,
} from '@piano/ipc'
import { FolderOpen, Library as LibraryIcon, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '../lib/cn'
import { clock, filingOf, tagsOf, type Filing } from '../lib/library'
import { LibraryFiling, type Clash } from './LibraryFiling'
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
 *
 * A row is also where a piece is put right, and where one leaves. Everything
 * the filing form asks about is in the row already, so correcting one opens
 * that same form filled in, and the list is asked for again once the write
 * lands. Deleting asks once, naming the piece rather than the id, because the
 * row is the last chance to notice it is the wrong one.
 *
 * A library grows by the batch and is tidied by the batch, so rows can be
 * picked and then deleted or tagged together, with one question asked of the
 * whole set. What this is not is a file manager: no folders, no moving, and
 * no renaming in bulk, because a rename asks a question that only makes sense
 * about one piece.
 */

type Level = NonNullable<LibraryQuery['level']>
type Order = NonNullable<LibraryQuery['order']>

const LEVELS: readonly { readonly value: Level | null; readonly label: string }[] = [
  { value: null, label: 'Any level' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

export function LibraryPanel({
  search,
  changes,
  onOpen,
  onOpenFile,
  leftBehind,
  onOpenLeft,
  onCorrect,
  onRemove,
  practised,
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
  /**
   * Write a row's corrected description back, answered with what became of
   * it. The row goes rather than its id: what a piece was called is what its
   * practice records are filed under until it has an id of its own.
   */
  readonly onCorrect: (
    item: LibraryItem,
    filing: Filing,
    taken?: 'beside' | 'replace',
  ) => Promise<LibraryCorrectResult>
  /** Take a row's piece out of the library, answered with what became of it. */
  readonly onRemove: (id: string) => Promise<LibraryRemoveResult>
  /** How many attempts are recorded against a row, which deleting has to account for. */
  readonly practised: (item: LibraryItem) => number
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
  /** The row being put right, and why the last attempt at it was refused. */
  const [correcting, setCorrecting] = useState<LibraryItem | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  /** The new title's id is somebody else's; nothing is written until that is answered. */
  const [clash, setClash] = useState<Clash | null>(null)
  /** The row being deleted, which is the one question asked before it goes. */
  const [deleting, setDeleting] = useState<LibraryItem | null>(null)
  /** What the panel has to say after a write, where the list is rather than over it. */
  const [said, setSaid] = useState<string | null>(null)
  /** The rows picked for something to be done to all of them at once. */
  const [picked, setPicked] = useState<readonly string[]>([])
  /** What a picked set is about to have done to it, once that is asked about. */
  const [asking, setAsking] = useState<'delete' | 'tag' | null>(null)

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
          // A pick is of a row, so it survives a listing that still has that
          // row — a file arriving in the folder — and goes with one that does
          // not, which is a narrowed search or a piece that has been deleted.
          setPicked((was) => {
            const there = new Set(found.map((one) => one.id))
            return was.length === 0 ? was : was.filter((id) => there.has(id))
          })
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

  /**
   * Write a corrected row back and ask for the list again, so the row says
   * what was just saved.
   *
   * A refusal keeps the form open with the reason in it: the piece may have
   * been deleted while the form was up, and the one place somebody can act on
   * that is where they typed. A taken id is not a refusal but a question, and
   * it is asked in the same form, which is where the title that caused it is.
   *
   * A piece that moved is said out loud. Its old name is what a chat, a
   * shortcut or the recent list may still ask for, and finding out by having
   * an open fail a week later is not a way to be told.
   */
  function correct(item: LibraryItem, filing: Filing, taken?: 'beside' | 'replace'): void {
    void onCorrect(item, filing, taken).then(
      (result) => {
        if (result.kind === 'refused') {
          setProblem(`That could not be saved: ${result.message}.`)
          return
        }
        if (result.kind === 'taken') {
          setClash(result)
          return
        }
        setCorrecting(null)
        setClash(null)
        setProblem(null)
        setSaid(
          result.id === item.id
            ? null
            : `${result.title} is filed as ${result.id} now, not ${item.id}. Anything still asking for the old name will not find it.`,
        )
        setRevision((was) => was + 1)
      },
      (cause: unknown) => {
        setProblem(
          `That could not be saved: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      },
    )
  }

  /**
   * Take a piece away and ask for the list again. The question has been asked
   * by the time this runs, so there is nothing more to say about a write that
   * worked; one that did not says why where the list is, since the row it was
   * about is the thing that did not change.
   */
  function remove(id: string): void {
    void onRemove(id).then(
      (result) => {
        setDeleting(null)
        setSaid(result.kind === 'removed' ? null : `That could not be deleted: ${result.message}.`)
        setRevision((was) => was + 1)
      },
      (cause: unknown) => {
        setDeleting(null)
        setSaid(
          `That could not be deleted: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      },
    )
  }

  /** The rows picked, as the list has them now. */
  const chosen = (items ?? []).filter((item) => picked.includes(item.id))

  /**
   * Do something to every picked row, one call at a time, and say how it went
   * in one sentence rather than a dialog per piece.
   *
   * In order rather than at once: these are writes to one directory, and a
   * dozen of them racing is how an index gets rebuilt from a half-written
   * folder. What is left picked afterwards is whatever did not work, so a
   * second attempt is about the pieces that still need one.
   */
  async function toEach(
    ids: readonly string[],
    each: (id: string) => Promise<boolean>,
    said: (done: number, failed: number) => string,
  ): Promise<void> {
    const failed: string[] = []
    let done = 0
    for (const id of ids) {
      try {
        if (await each(id)) {
          done += 1
        } else {
          failed.push(id)
        }
      } catch {
        failed.push(id)
      }
    }
    setAsking(null)
    setPicked(failed)
    setSaid(said(done, failed.length))
    setRevision((was) => was + 1)
  }

  /** Delete every picked piece, having asked once about the whole set. */
  function removeAll(): void {
    const of = picked.length
    void toEach(
      picked,
      async (id) => (await onRemove(id)).kind === 'removed',
      (done, failed) =>
        failed === 0
          ? `Deleted ${String(done)} of ${String(of)} pieces.`
          : `Deleted ${String(done)} of ${String(of)} pieces; ${String(failed)} could not be.`,
    )
  }

  /**
   * Add tags to every picked piece, keeping the ones each already has.
   *
   * A tag cannot move a piece the way a title can, so this never meets the
   * question about a name something else holds, and it needs no answer to one.
   */
  function tagAll(words: string): void {
    const added = tagsOf(words)
    const of = picked.length
    void toEach(
      picked,
      async (id) => {
        const item = chosen.find((one) => one.id === id)
        if (item === undefined) {
          return false
        }
        const filing = filingOf(item)
        const result = await onCorrect(item, {
          ...filing,
          tags: [...new Set([...tagsOf(filing.tags), ...added])].join(', '),
        })
        return result.kind === 'corrected'
      },
      (done, failed) =>
        failed === 0
          ? `Tagged ${String(done)} of ${String(of)} pieces.`
          : `Tagged ${String(done)} of ${String(of)} pieces; ${String(failed)} could not be.`,
    )
  }

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
                  className="flex items-start justify-between gap-2 rounded-(--radius) px-2 py-2 hover:bg-surface-raised"
                >
                  <input
                    type="checkbox"
                    aria-label={`Pick ${item.title}`}
                    checked={picked.includes(item.id)}
                    onChange={(event) => {
                      setSaid(null)
                      setPicked((was) =>
                        event.target.checked
                          ? [...was, item.id]
                          : was.filter((one) => one !== item.id),
                      )
                    }}
                    className="mt-1 size-4 shrink-0 accent-accent"
                  />
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
                   * Capped short of half the row, the two doors included: a
                   * composer is a sentence in a score written for this app,
                   * not a name, and chips that refused to give ground left the
                   * title nothing to show.
                   */}
                  <span className="flex max-w-[45%] items-start gap-1">
                    <span className="flex min-w-0 flex-wrap justify-end gap-1 text-xs">
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
                    {/*
                     * At the end of the row and unlabelled: correcting a piece
                     * is the rarer thing to want, and a word here would take
                     * the room the chips are already fighting the title for.
                     */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 px-2"
                      aria-label={`Correct ${item.title}`}
                      title={`Correct ${item.title}`}
                      onClick={() => {
                        setProblem(null)
                        setClash(null)
                        setSaid(null)
                        setCorrecting(item)
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 px-2"
                      aria-label={`Delete ${item.title}`}
                      title={`Delete ${item.title}`}
                      onClick={() => {
                        setSaid(null)
                        setDeleting(item)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {picked.length === 0 ? null : (
          <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle pt-3 text-sm">
            <span className="text-text-default">
              {picked.length === 1 ? '1 piece picked' : `${String(picked.length)} pieces picked`}
            </span>
            <span className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPicked([])
                }}
              >
                Clear
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAsking('tag')
                }}
              >
                Tag them
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setAsking('delete')
                }}
              >
                Delete them
              </Button>
            </span>
          </div>
        )}

        {asking === null ? null : (
          <AskAboutAll
            what={asking}
            items={chosen}
            onTag={tagAll}
            onDelete={removeAll}
            onClose={() => {
              setAsking(null)
            }}
          />
        )}

        {said === null ? null : (
          <p className="mt-3 shrink-0 text-sm text-text-strong" role="alert">
            {said}
          </p>
        )}

        {left.length === 0 ? null : (
          <LeftBehind
            left={left}
            onOpen={(name) => {
              setShowing(false)
              onOpenLeft(name)
            }}
          />
        )}

        {deleting === null ? null : (
          <ConfirmDelete
            item={deleting}
            practised={practised(deleting)}
            onDelete={() => {
              remove(deleting.id)
            }}
            onClose={() => {
              setDeleting(null)
            }}
          />
        )}

        {correcting === null ? null : (
          <LibraryFiling
            start={filingOf(correcting)}
            purpose="correcting"
            clash={clash}
            problem={problem}
            onFile={(filing, taken) => {
              correct(correcting, filing, taken)
            }}
            onClose={() => {
              setCorrecting(null)
              setClash(null)
              setProblem(null)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * The one question asked of a whole selection.
 *
 * One question and not eleven, which is the point: eleven MIDI files that all
 * arrived as Untitled are deleted by somebody who stopped reading at the
 * third dialog, and tagging a dozen pieces one at a time is a dozen trips
 * through a form. So the count is what is named, and the pieces are listed
 * under it so nobody deletes a set they did not mean to pick.
 *
 * Tagging adds rather than replaces: the reason to tag twelve pieces at once
 * is that they have something in common, not that they should stop being
 * whatever else they are.
 */
function AskAboutAll({
  what,
  items,
  onTag,
  onDelete,
  onClose,
}: {
  readonly what: 'delete' | 'tag'
  readonly items: readonly LibraryItem[]
  readonly onTag: (words: string) => void
  readonly onDelete: () => void
  readonly onClose: () => void
}) {
  const [words, setWords] = useState('')
  const count = items.length === 1 ? 'this piece' : `these ${String(items.length)} pieces`

  return (
    <Dialog
      open
      onOpenChange={(showing) => {
        if (!showing) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{what === 'delete' ? `Delete ${count}?` : `Tag ${count}`}</DialogTitle>
          <DialogDescription>
            {what === 'delete'
              ? 'They go to the bin, so you can put them back from there. What each one has been practised is kept.'
              : 'The tags each piece already has are kept; these are added to them.'}
          </DialogDescription>
        </DialogHeader>

        <ul aria-label="The pieces picked" className="max-h-48 overflow-auto text-sm">
          {items.map((item) => (
            <li key={item.id} className="truncate py-0.5 text-text-default">
              {[item.title, item.composer].filter((part) => part !== undefined).join(' · ')}
            </li>
          ))}
        </ul>

        {what === 'tag' ? (
          <input
            aria-label="Tags to add"
            placeholder="Separated by commas: study, baroque"
            value={words}
            onChange={(event) => {
              setWords(event.target.value)
            }}
            className="mt-2 h-9 w-full rounded-(--radius) border border-border-subtle bg-surface-base px-3 text-sm text-text-default placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent"
          />
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {what === 'delete' ? 'Keep them' : 'Cancel'}
          </Button>
          {what === 'delete' ? (
            <Button variant="danger" size="sm" onClick={onDelete}>
              Delete them
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={words.trim() === ''}
              onClick={() => {
                onTag(words)
              }}
            >
              Add the tags
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The one question asked before a piece goes.
 *
 * Described rather than named, the way the filing clash describes what is in
 * the way: the title, the composer and how long it lasts are what say whether
 * this is the piece somebody meant, and an id reduced to lower case and
 * hyphens is not. Asked once and not twice — a second confirmation is one
 * people learn to click through — and answerable afterwards, because the file
 * goes to the system's bin rather than nowhere, which is what the sentence
 * says so nobody has to find out by trying it.
 *
 * Practice records are the other thing at stake, and they are kept: they are
 * the only thing that says somebody played this, the file can come back out
 * of the bin, and records that outlive a piece cost a few hundred bytes.
 * Said rather than asked, because a question about history in the middle of
 * deleting a file is a question nobody has come here to answer.
 */
function ConfirmDelete({
  item,
  practised,
  onDelete,
  onClose,
}: {
  readonly item: LibraryItem
  /** How many attempts are recorded against it; nothing is said where none is. */
  readonly practised: number
  readonly onDelete: () => void
  readonly onClose: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(showing) => {
        if (!showing) {
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this piece?</DialogTitle>
          <DialogDescription>
            It goes to the bin, so you can put it back from there.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-text-strong">
          {[item.title, item.composer, clock(item.seconds)]
            .filter((part) => part !== undefined)
            .join(' · ')}
        </p>
        {practised === 0 ? null : (
          <p className="text-sm text-text-muted">
            {practised === 1
              ? 'The one attempt recorded against it is kept, in case you put it back.'
              : `The ${String(practised)} attempts recorded against it are kept, in case you put it back.`}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="danger" size="sm" onClick={onDelete}>
            Delete it
          </Button>
        </div>
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
