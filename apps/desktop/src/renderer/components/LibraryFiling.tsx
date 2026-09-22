import type { LibrarySaveResult } from '@piano/ipc'
import { LEVELS, type Score } from '@piano/score-format'
import { useState } from 'react'

import { filingFor, type Filing } from '../lib/library'
import { clock } from './LibraryPanel'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

/**
 * Describing a piece as it goes into the library.
 *
 * An import knows almost nothing about the music. A MIDI file carries a track
 * name, which is a title only by luck, and General MIDI has no field for a
 * composer, a level or a tag; MusicXML carries a work title and a creator and
 * stops there. The library is built around exactly those fields: the level
 * buttons, the composer chip and the tag chips all read them, and a piece with
 * none of them can be found only by typing part of its title. Twenty files in,
 * the panel is a list its own filters cannot narrow.
 *
 * So the door asks, once, with what was worked out already filled in. Nothing
 * is compulsory beyond a title: a piece filed with a title alone is still
 * filed, and the rest can be added later by asking Claude Code, which writes
 * the same metadata through save_score.
 *
 * The clash over a taken id is answered here too, rather than in a dialog of
 * its own: what this piece is called and where it goes is one question, and
 * asking it twice would be asking somebody to describe a piece and then argue
 * about its name.
 */

export type Clash = Extract<LibrarySaveResult, { kind: 'taken' }>

const FIELD =
  'h-9 w-full rounded-(--radius) border border-border-subtle bg-surface-base px-3 text-sm text-text-default placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent'

export function LibraryFiling({
  score,
  clash,
  onFile,
  onClose,
}: {
  /** The piece being filed, which is where the form starts. */
  readonly score: Score
  /** What holds the id already, once main has said so; null until then. */
  readonly clash: Clash | null
  readonly onFile: (filing: Filing, taken?: 'beside' | 'replace') => void
  readonly onClose: () => void
}) {
  const [filing, setFiling] = useState<Filing>(() => filingFor(score))
  const change = (part: Partial<Filing>) => {
    setFiling((was) => ({ ...was, ...part }))
  }

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
          <DialogTitle>Add to the library</DialogTitle>
          <DialogDescription>
            What the file could not say. Only the title is needed; the rest is what the list filters
            by.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Title
            <input
              aria-label="Title"
              value={filing.title}
              onChange={(event) => {
                change({ title: event.target.value })
              }}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Composer
            <input
              aria-label="Composer"
              placeholder="Nobody named one"
              value={filing.composer}
              onChange={(event) => {
                change({ composer: event.target.value })
              }}
              className={FIELD}
            />
          </label>
          <div className="flex flex-col gap-1 text-sm text-text-muted">
            Level
            <div className="flex flex-wrap items-center gap-2">
              {[null, ...LEVELS].map((one) => (
                <Button
                  key={one ?? 'none'}
                  variant={filing.level === one ? 'secondary' : 'ghost'}
                  size="sm"
                  aria-pressed={filing.level === one}
                  onClick={() => {
                    change({ level: one })
                  }}
                >
                  {one === null ? 'Not said' : `${one.slice(0, 1).toUpperCase()}${one.slice(1)}`}
                </Button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm text-text-muted">
            Tags
            <input
              aria-label="Tags"
              placeholder="Separated by commas: study, baroque"
              value={filing.tags}
              onChange={(event) => {
                change({ tags: event.target.value })
              }}
              className={FIELD}
            />
          </label>
        </div>

        {clash === null ? (
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              disabled={filing.title.trim() === ''}
              onClick={() => {
                onFile(filing)
              }}
            >
              Add it
            </Button>
          </div>
        ) : (
          /*
           * Described rather than named: the choice is between two pieces and
           * not between two ids, and the title, the composer and how long it
           * lasts are what say whether this is the same piece again.
           */
          <div className="mt-4 flex flex-col gap-2 rounded-(--radius) border border-border-subtle p-3">
            <p className="text-sm text-text-strong">The library already has a {clash.id}</p>
            <p className="text-sm text-text-default">
              {[clash.held.title, clash.held.composer, clock(clash.held.seconds)]
                .filter((part) => part !== undefined)
                .join(' · ')}
            </p>
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onFile(filing, 'beside')
                }}
              >
                File this one beside it
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onFile(filing, 'replace')
                }}
              >
                Replace what is there
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
