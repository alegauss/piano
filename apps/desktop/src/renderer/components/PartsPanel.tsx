import type { Hand, Part } from '@piano/score-format'
import { Eye, EyeOff, Volume2, VolumeX } from 'lucide-react'

import { cn } from '../lib/cn'
import {
  HANDS,
  toggleHidden,
  toggleHiddenHand,
  toggleMuted,
  toggleMutedHand,
  toggleSoloed,
  type PartsView,
} from '../lib/parts'
import type { CanvasToken } from '../lib/theme'
import { Button } from './ui/button'
import { Hint } from './ui/tooltip'

/**
 * The panel that turns a recording into something that can be taken apart.
 *
 * A row per part with its colour, and a row per hand, because hand is a
 * property of the note rather than of the part and "left hand only" is what
 * a learner asks for most often. Each row carries hearing and watching
 * separately, and solo on top of hearing.
 */

export type PartsPanelProps = {
  readonly parts: readonly Part[]
  /** The colour the roll draws each part in, so the swatch cannot disagree with the field. */
  readonly colours: ReadonlyMap<string, CanvasToken>
  /** The hands the piece actually writes for; a piece that names none gets no hand rows. */
  readonly hands: readonly Hand[]
  readonly view: PartsView
  readonly onView: (view: PartsView) => void
  readonly className?: string
}

const HAND_NAMES: Readonly<Record<Hand, string>> = {
  left: 'Left hand',
  right: 'Right hand',
}

export function PartsPanel({ parts, colours, hands, view, onView, className }: PartsPanelProps) {
  return (
    <section
      aria-label="Parts"
      className={cn(
        'flex w-56 shrink-0 flex-col gap-4 overflow-auto border-r border-border-subtle bg-surface-raised px-3 py-4',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-text-muted uppercase">
          Parts
        </h2>
        {parts.map((part) => (
          <Row
            key={part.id}
            name={part.name}
            colour={colours.get(part.id)}
            muted={view.muted.includes(part.id)}
            soloed={view.soloed.includes(part.id)}
            hidden={view.hidden.includes(part.id)}
            onMute={() => {
              onView(toggleMuted(view, part.id))
            }}
            onSolo={(additive) => {
              onView(toggleSoloed(view, part.id, additive))
            }}
            onHide={() => {
              onView(toggleHidden(view, part.id))
            }}
          />
        ))}
      </div>

      {hands.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-text-muted uppercase">
            Hands
          </h2>
          {HANDS.filter((hand) => hands.includes(hand)).map((hand) => (
            <Row
              key={hand}
              name={HAND_NAMES[hand]}
              muted={view.mutedHands.includes(hand)}
              hidden={view.hiddenHands.includes(hand)}
              onMute={() => {
                onView(toggleMutedHand(view, hand))
              }}
              onHide={() => {
                onView(toggleHiddenHand(view, hand))
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function Row({
  name,
  colour,
  muted,
  soloed,
  hidden,
  onMute,
  onSolo,
  onHide,
}: {
  readonly name: string
  readonly colour?: CanvasToken
  readonly muted: boolean
  readonly soloed?: boolean
  readonly hidden: boolean
  readonly onMute: () => void
  readonly onSolo?: (additive: boolean) => void
  readonly onHide: () => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-(--radius) px-1 py-1">
      {colour === undefined ? null : (
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-full"
          style={{ background: `var(${colour})` }}
        />
      )}
      <span
        className={cn('flex-1 truncate text-sm', muted ? 'text-text-muted' : 'text-text-default')}
      >
        {name}
      </span>
      {/*
        A speaker and an eye side by side are the pair somebody has to guess
        between, and this is the panel that keeps silencing and hiding apart
        on purpose. Each button already carries the sentence that settles it —
        "Silence Melody", "Hide Bass" — so the hint reads it off the button
        rather than being handed a second copy.
      */}
      <Hint>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${muted ? 'Hear' : 'Silence'} ${name}`}
          aria-pressed={muted}
          onClick={onMute}
        >
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </Hint>
      {onSolo === undefined ? null : (
        <Hint>
          <Button
            variant={soloed === true ? 'selected' : 'ghost'}
            size="icon"
            className="size-7 text-xs"
            aria-label={`Solo ${name}`}
            aria-pressed={soloed === true}
            onClick={(event) => {
              // The modifier every audio tool uses to add to a solo rather
              // than replace it.
              onSolo(event.shiftKey || event.metaKey || event.ctrlKey)
            }}
          >
            S
          </Button>
        </Hint>
      )}
      <Hint>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={`${hidden ? 'Show' : 'Hide'} ${name}`}
          aria-pressed={hidden}
          onClick={onHide}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </Button>
      </Hint>
    </div>
  )
}
