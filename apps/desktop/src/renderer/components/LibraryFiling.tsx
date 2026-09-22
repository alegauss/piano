import type { LibraryCorrectResult, LibrarySaveResult } from '@piano/ipc'
import { LEVELS } from '@piano/score-format'
import { useState } from 'react'

import { clock, type Filing } from '../lib/library'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

/**
 * Describing a piece, on its way into the library or afterwards.
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
 * filed, and the rest can be corrected here later.
 *
 * One form and not two, because these are the same questions asked at a
 * different moment, and a second form would drift from this one the first time
 * a field was added. Either may find the id it wants taken — an import's is
 * whatever a track name happened to say, and a piece retitled moves to the
 * name its new title gives it — so that is asked about below rather than in a
 * dialog of its own: what a piece is called and where it goes is one question,
 * and asking it twice would be asking somebody to describe a piece and then
 * argue about its name. Correcting can also find the piece gone, and that too
 * is said in the form rather than behind it.
 *
 * Only a correction offers difficulty. Filing has nobody to ask — the number
 * grades a piece somebody has played — but it is what orders the rows inside a
 * level, and nothing else on screen can set it.
 */

export type Clash = Extract<LibrarySaveResult | LibraryCorrectResult, { kind: 'taken' }>

const FIELD =
  'h-9 w-full rounded-(--radius) border border-border-subtle bg-surface-base px-3 text-sm text-text-default placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-accent'

/** One to ten, and the empty choice that means nobody has said. */
const DIFFICULTIES = ['', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const

export function LibraryFiling({
  start,
  purpose,
  clash,
  problem = null,
  onFile,
  onClose,
}: {
  /** The piece as it is described now, which is where the form starts. */
  readonly start: Filing
  /** A piece on its way in, or one already filed and being put right. */
  readonly purpose: 'filing' | 'correcting'
  /** What holds the id already, once main has said so; null until then. */
  readonly clash: Clash | null
  /** Why the last attempt was refused, shown where it was asked. */
  readonly problem?: string | null
  readonly onFile: (filing: Filing, taken?: 'beside' | 'replace') => void
  readonly onClose: () => void
}) {
  const [filing, setFiling] = useState<Filing>(start)
  const change = (part: Partial<Filing>) => {
    setFiling((was) => ({ ...was, ...part }))
  }
  const correcting = purpose === 'correcting'

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
          <DialogTitle>{correcting ? 'Correct this piece' : 'Add to the library'}</DialogTitle>
          <DialogDescription>
            {correcting
              ? 'What the piece says about itself. Its notes are not touched; a new title moves it to the name that title gives it.'
              : 'What the file could not say. Only the title is needed; the rest is what the list filters by.'}
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
          {/*
           * A choice rather than a number typed: ten is the whole range, and a
           * field somebody can put 40 in is a field that needs an error under
           * it.
           */}
          {correcting ? (
            <label className="flex flex-col gap-1 text-sm text-text-muted">
              Difficulty
              <select
                aria-label="Difficulty"
                value={filing.difficulty}
                onChange={(event) => {
                  change({ difficulty: event.target.value })
                }}
                className={FIELD}
              >
                {DIFFICULTIES.map((one) => (
                  <option key={one === '' ? 'none' : one} value={one}>
                    {one === '' ? 'Not said' : `${one} of 10`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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

        {problem === null ? null : (
          <p className="mt-3 text-sm text-text-strong" role="alert">
            {problem}
          </p>
        )}

        {clash === null ? (
          <div className="mt-4 flex justify-end">
            <Button
              size="sm"
              disabled={filing.title.trim() === ''}
              onClick={() => {
                onFile(filing)
              }}
            >
              {correcting ? 'Save it' : 'Add it'}
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
