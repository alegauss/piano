import { useEffect, useRef, useState, type RefObject } from 'react'

import { cn } from '../lib/cn'
import { BLACK_KEY_LENGTH, keyboardLayout } from '../lib/keyboard-geometry'

/**
 * What a key is showing. Visual only and set from outside, so one keyboard
 * serves listening and practice without knowing which it is in.
 */
export type KeyState = 'idle' | 'sounding' | 'expected' | 'correct' | 'wrong' | 'late'

const WHITE: Readonly<Record<KeyState, string>> = {
  idle: 'bg-key-white',
  sounding: 'bg-key-white-pressed',
  expected: 'bg-judge-expected',
  correct: 'bg-judge-correct',
  wrong: 'bg-judge-wrong',
  late: 'bg-judge-late',
}

const BLACK: Readonly<Record<KeyState, string>> = {
  idle: 'bg-key-black',
  sounding: 'bg-key-black-pressed',
  expected: 'bg-judge-expected',
  correct: 'bg-judge-correct',
  wrong: 'bg-judge-wrong',
  late: 'bg-judge-late',
}

/** The width an element is given, kept current as the window changes. */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (element === null) {
      return
    }
    setWidth(element.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) {
        setWidth(entry.contentRect.width)
      }
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
    }
  }, [])
  return [ref, width]
}

/**
 * The 88 keys along the bottom of the roll, A0 to C8.
 *
 * Key width comes from the space available, so it reads from a narrow window
 * to a full screen. Each key is placed by keyRect, the same function the roll
 * draws falling notes with.
 */
export function PianoKeyboard({
  states,
  className,
}: {
  readonly states?: ReadonlyMap<number, KeyState>
  readonly className?: string
}) {
  const [ref, width] = useWidth()
  const keys = width > 0 ? keyboardLayout(width) : []

  return (
    <div
      ref={ref}
      role="img"
      aria-label="Piano keyboard, 88 keys"
      className={cn('relative h-28 w-full select-none overflow-hidden', className)}
    >
      {keys.map((key) => {
        const state = states?.get(key.pitch) ?? 'idle'
        return (
          <div
            key={key.pitch}
            data-pitch={key.pitch}
            data-state={state}
            className={cn(
              'absolute top-0',
              key.black
                ? cn('z-10 rounded-b-sm', BLACK[state])
                : cn('h-full rounded-b-sm border-r border-b border-border-strong', WHITE[state]),
            )}
            style={{
              left: key.x,
              width: key.width,
              ...(key.black ? { height: `${String(BLACK_KEY_LENGTH * 100)}%` } : {}),
            }}
          />
        )
      })}
    </div>
  )
}
