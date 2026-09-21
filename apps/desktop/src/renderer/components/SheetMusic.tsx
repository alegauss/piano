import { barAtTick, type Note, type ResolvedTiming } from '@piano/score-format'
import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../lib/cn'
import { noteLook, type Feedback } from '../lib/grading'
import { DEFAULT_SHEET_ZOOM, planSheet } from '../lib/sheet'
import { drawSheet } from '../lib/sheet-draw'
import { bandFor, colouring, systemFor, type Band } from '../lib/sheet-follow'
import { readings } from '../lib/sheet-readings'
import type { CanvasToken } from '../lib/theme'

/**
 * The piece as it would be written down, following the playhead.
 *
 * A player who reads staff notation gets nothing from a falling roll, and the
 * roll was the only reading this app had. This is the other one: the open
 * score on staves, one per hand, reflowed to the panel it is given.
 *
 * Read-only, and that is the whole of it. Editing a score by dragging a
 * notehead is the non-goal this view stops short of; it shows a file somebody
 * else wrote and never writes one back.
 *
 * The position is a function rather than a prop, as it is for the roll: it
 * changes sixty times a second and nothing above needs to re-render for it. A
 * page is engraved once per layout, and playback only moves a band over it and
 * swaps colours on glyphs already drawn. Re-engraving per frame would be the
 * one thing in this app that cannot keep up with its own clock.
 *
 * The notes arrive already filtered, so hiding a part in the parts panel hides
 * it here without a second filter deciding the same thing differently.
 */

export type SheetMusicProps = {
  readonly timing: ResolvedTiming
  readonly notes: readonly Note[]
  /** metadata.key as the file spells it; an unreadable one draws no signature. */
  readonly musicKey?: string
  /** How large the page is drawn, as a multiple. The layout does not change with it. */
  readonly zoom?: number
  /** Where playback is, in ticks, read once a frame. */
  readonly position?: () => number
  /** The practice tempo, which is what a missed note is judged against. */
  readonly tempoScale?: () => number
  /**
   * What the player has made of the notes so far, read once a frame like the
   * position. Without it the page is drawn and nothing is judged.
   */
  readonly feedback?: () => Feedback | null
  readonly className?: string
}

export function SheetMusic({
  timing,
  notes,
  musicKey,
  zoom = DEFAULT_SHEET_ZOOM,
  position = () => 0,
  tempoScale = () => 1,
  feedback = () => null,
  className,
}: SheetMusicProps) {
  const frame = useRef<HTMLDivElement | null>(null)
  const page = useRef<HTMLDivElement | null>(null)
  const band = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  // The panel's width is read from the element it is given rather than
  // guessed, and only when it changes: the plan wraps to it, so a resize is
  // the one thing that has to engrave the page again.
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

  const inferred = useMemo(
    () => readings({ timing, notes, key: musicKey, plan }),
    [timing, notes, musicKey, plan],
  )

  // Read through a ref so that a new score does not tear down and rebuild the
  // loop mid-flight. The theme is not in here: the page is coloured by
  // styles/sheet.css, which follows data-theme without being told.
  const read = useRef({ timing, plan, position, tempoScale, feedback, zoom })
  useEffect(() => {
    read.current = { timing, plan, position, tempoScale, feedback, zoom }
  })

  useEffect(() => {
    const element = page.current
    if (element === null || width === 0) {
      return
    }
    const drawn = drawSheet(element, plan, zoom)
    const scroller = frame.current

    let running = true
    /** What each glyph is marked now, so a frame writes only what changed. */
    const marked = new Map<string, CanvasToken>()
    /** The last bar the band was put on, and the last system scrolled to. */
    let shownBar: number | null = null
    let shownSystem: number | null = null

    const follow = () => {
      if (!running) {
        return
      }
      requestAnimationFrame(follow)
      const current = read.current
      const at = current.position()
      const bar = barAtTick(current.timing, at).bar

      // The band and the page turn only move between bars, so they are asked
      // about once a bar rather than once a frame.
      if (bar !== shownBar) {
        shownBar = bar
        const box = bandFor(current.plan, bar)
        place(band.current, bar, box, current.zoom)
        const system = systemFor(current.plan, bar)
        if (system >= 0 && system !== shownSystem) {
          shownSystem = system
          turn(scroller, (current.plan.systems[system]?.y ?? 0) * current.zoom)
        }
        // Across as well as down: magnified, a system is wider than the panel,
        // and a bar to the right of it is as lost as one below the fold.
        across(scroller, box, current.zoom)
      }

      const judged = current.feedback()
      remark(
        drawn.glyphs,
        marked,
        colouring(current.plan, {
          position: at,
          look: (note) =>
            judged === null
              ? null
              : noteLook(judged, note, {
                  timing: current.timing,
                  position: at,
                  tempoScale: current.tempoScale(),
                }),
        }),
      )
    }

    requestAnimationFrame(follow)
    return () => {
      running = false
    }
  }, [plan, width, zoom])

  return (
    <section
      ref={frame}
      aria-label="Sheet music"
      className={cn('relative min-h-0 flex-1 overflow-auto bg-surface-raised', className)}
    >
      {plan.systems.length === 0 ? (
        <p className="px-6 py-8 text-sm text-text-muted">Nothing is open to read.</p>
      ) : (
        <>
          <div
            ref={band}
            aria-hidden
            data-testid="sheet-band"
            className="pointer-events-none absolute top-0 left-0 hidden rounded-(--radius) bg-sheet-band"
          />
          <div ref={page} className="relative" />
          {/*
            Said once for the piece, and never off the page: a stave drawn from
            inference looks exactly like one drawn from a manuscript, so the
            summary stays visible and the readings are one click behind it, the
            way a refused file keeps where-in-the-file one click away.
          */}
          <details data-testid="sheet-readings" className="mt-2 px-4 pb-4 text-xs text-text-muted">
            <summary className="cursor-pointer">
              {inferred.length} {inferred.length === 1 ? 'reading' : 'readings'} on this page are
              the app&rsquo;s, not the score&rsquo;s
            </summary>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              {inferred.map((reading) => (
                <li key={reading}>{reading}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}

/** Room left above a system the page has just turned to. */
const SYSTEM_MARGIN = 12

/**
 * Put the band over a bar's box, or take it off the page entirely.
 *
 * The bar it is on is written on the element, as the keyboard writes the pitch
 * and the state of each key: it is the one place the answer exists, and a
 * reader of the page — or a test — would otherwise have to work it back out of
 * a transform.
 */
function place(mark: HTMLDivElement | null, bar: number, box: Band | null, zoom: number): void {
  if (mark === null) {
    return
  }
  mark.dataset['bar'] = box === null ? '' : String(bar)
  mark.style.display = box === null ? 'none' : 'block'
  if (box !== null) {
    // The plan is in unscaled units and the page is drawn scaled, so the band
    // is placed in the page's units rather than the plan's.
    mark.style.transform = `translate(${String(box.x * zoom)}px, ${String(box.y * zoom)}px)`
    mark.style.width = `${String(box.width * zoom)}px`
    mark.style.height = `${String(box.height * zoom)}px`
  }
}

/**
 * Bring the sounding bar into view sideways, and only when it is not.
 *
 * Left edge first, so the bar is read from its start: a bar wider than the
 * panel is shown from its beginning rather than its end.
 */
function across(scroller: HTMLElement | null, box: Band | null, zoom: number): void {
  if (scroller === null || box === null) {
    return
  }
  const left = box.x * zoom
  const right = left + box.width * zoom
  const shown = left >= scroller.scrollLeft && right <= scroller.scrollLeft + scroller.clientWidth
  if (!shown) {
    scroller.scrollLeft = Math.max(0, left - SYSTEM_MARGIN)
  }
}

/**
 * Turn to the system at this height, and only where it is not already in
 * view: scrolling to a system the reader can see would snatch the page from
 * under them every few bars.
 */
function turn(scroller: HTMLElement | null, top: number): void {
  if (
    scroller === null ||
    (top >= scroller.scrollTop && top < scroller.scrollTop + scroller.clientHeight)
  ) {
    return
  }
  scroller.scrollTop = Math.max(0, top - SYSTEM_MARGIN)
}

/**
 * Bring the page's marks to what the frame wants, writing only the
 * differences. `marked` is what the page carries now, and this leaves it so.
 */
function remark(
  glyphs: ReadonlyMap<string, SVGElement>,
  marked: Map<string, CanvasToken>,
  wanted: ReadonlyMap<string, CanvasToken>,
): void {
  for (const [id, token] of wanted) {
    if (marked.get(id) !== token) {
      mark(glyphs.get(id), token)
      marked.set(id, token)
    }
  }
  // Copied, because the loop deletes from the very map it is walking.
  for (const id of [...marked.keys()]) {
    if (!wanted.has(id)) {
      mark(glyphs.get(id), null)
      marked.delete(id)
    }
  }
}

/**
 * Say what a glyph has become of, or take the word back.
 *
 * The token's name, not its colour: styles/sheet.css has a rule per token, so
 * this writes what the figure means and the stylesheet decides what that looks
 * like in the theme that is on. Writing a resolved colour here would be this
 * component naming one, and it would also have to be rewritten on every theme
 * change — and taking it off again would strip the engraving's own ink with it.
 */
function mark(glyph: SVGElement | undefined, token: CanvasToken | null): void {
  if (glyph === undefined) {
    return
  }
  if (token === null) {
    delete glyph.dataset['ink']
  } else {
    glyph.dataset['ink'] = token
  }
}
