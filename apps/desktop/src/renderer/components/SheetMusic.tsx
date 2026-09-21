import type { Note, ResolvedTiming } from '@piano/score-format'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../lib/cn'
import { planSheet } from '../lib/sheet'
import { drawSheet } from '../lib/sheet-draw'

/**
 * The piece as it would be written down.
 *
 * A player who reads staff notation gets nothing from a falling roll, and the
 * roll is the only reading this app had. This is the other one: the open score
 * on staves, one per hand, reflowed to the panel it is given.
 *
 * Read-only, and that is the whole of it. Editing a score by dragging a
 * notehead is the non-goal this view stops short of; it shows a file somebody
 * else wrote and never writes one back.
 *
 * The notes arrive already filtered, so hiding a part in the parts panel hides
 * it here without a second filter deciding the same thing differently.
 */

export type SheetMusicProps = {
  readonly timing: ResolvedTiming
  readonly notes: readonly Note[]
  /** metadata.key as the file spells it; an unreadable one draws no signature. */
  readonly musicKey?: string
  readonly className?: string
}

export function SheetMusic({ timing, notes, musicKey, className }: SheetMusicProps) {
  const frame = useRef<HTMLDivElement | null>(null)
  const page = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  // The panel's width is read from the element it is given rather than
  // guessed, and only when it changes: the plan wraps to it, so a resize is
  // the one thing that has to redraw the page.
  useEffect(() => {
    const element = frame.current
    if (element === null) {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => {
      observer.disconnect()
    }
  }, [])

  const plan = useMemo(
    () => planSheet({ timing, notes, key: musicKey, width }),
    [timing, notes, musicKey, width],
  )

  useEffect(() => {
    const element = page.current
    if (element === null || width === 0) {
      return
    }
    drawSheet(element, plan)
  }, [plan, width])

  return (
    <section
      ref={frame}
      aria-label="Sheet music"
      className={cn('min-h-0 flex-1 overflow-auto bg-surface-raised', className)}
    >
      {plan.systems.length === 0 ? (
        <p className="px-6 py-8 text-sm text-text-muted">Nothing is open to read.</p>
      ) : (
        <div ref={page} />
      )}
    </section>
  )
}
