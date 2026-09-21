import type { AppInfoResponse } from '@piano/ipc'
import {
  describeScore,
  FORMAT_VERSION,
  noteEnd,
  notesOf,
  timingOf,
  type Score,
} from '@piano/score-format'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { Transport, type LoopRange } from './audio'
import { readBridge } from './bridge'
import { PianoRoll } from './components/PianoRoll'
import { SoundStatus } from './components/SoundStatus'
import { TokenGallery } from './components/TokenGallery'
import { TransportBar } from './components/TransportBar'
import { cn } from './lib/cn'
import { DEFAULT_LEAD_SECONDS } from './lib/roll'
import { appPiano, appSound } from './lib/sound'
import { getTheme, setTheme, type ThemeName } from './lib/theme'

/**
 * A stand-in until PI51 can open a real file. It exists so the renderer reads
 * the score format from the shared package rather than describing a score its
 * own way, which is the drift PI2 exists to prevent.
 *
 * It carries a few notes so there is something to play and something to draw
 * before there is anything to open: a C major arpeggio over two bars.
 */
const placeholder: Score = {
  formatVersion: FORMAT_VERSION,
  metadata: { title: 'Nothing loaded', composer: 'no composer yet' },
  notes: [60, 64, 67, 72, 76, 79, 84, 88].map((pitch, index) => ({
    pitch,
    start: index * 240,
    duration: 220,
    velocity: 72,
  })),
}

export function App() {
  const [info, setInfo] = useState<AppInfoResponse | null>(null)
  // Whether the bridge is there is settled before the first render and never
  // changes, so it belongs in the initial state rather than in an effect that
  // would render once with the wrong answer and then correct itself.
  const [error, setError] = useState<string | null>(() =>
    readBridge() === null ? 'no bridge: this page is not running inside the app' : null,
  )
  const [theme, setThemeState] = useState<ThemeName>(getTheme)
  const [leadSeconds, setLeadSeconds] = useState(DEFAULT_LEAD_SECONDS)
  const [effects, setEffects] = useState(true)
  const [full, setFull] = useState(false)
  const [loop, setLoop] = useState<LoopRange | null>(null)
  const sound = appSound()
  const soundState = useSyncExternalStore(sound.subscribe, () => sound.state)

  const timing = useMemo(() => timingOf(placeholder), [])
  const notes = useMemo(() => notesOf(placeholder), [])
  const lastTick = useMemo(
    () => notes.reduce((last, note) => Math.max(last, noteEnd(note)), 0),
    [notes],
  )

  // One transport for the life of the window, on the one audio clock.
  const piano = appPiano()
  const transport = useMemo(() => {
    const made = new Transport(piano.engine, { now: () => piano.now() }, undefined, piano.clicker)
    made.load({ timing, notes })
    return made
  }, [piano, timing, notes])

  // The piano starts synthesised and moves onto the installed pack as its
  // recordings arrive; nothing waits for that.
  useEffect(() => {
    sound.start()
  }, [sound])

  useEffect(() => {
    const bridge = readBridge()
    if (bridge === null) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const next = await bridge.appInfo()
        if (!cancelled) {
          setInfo(next)
        }
        // The title belongs to main; the renderer asks for it by intent.
        await bridge.setWindowTitle({ title: `Piano — ${describeScore(placeholder)}` })
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Full screen is a way of playing rather than a window state: everything
  // but the roll and the keyboard goes, and escape brings it back.
  useEffect(() => {
    if (!full) {
      return
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFull(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [full])

  function chooseTheme(next: ThemeName) {
    setTheme(next)
    setThemeState(next)
  }

  function chooseLoop(range: LoopRange | null) {
    setLoop(range)
    transport.setLoop(range)
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col bg-surface-base',
        full ? 'overflow-hidden' : 'overflow-auto',
      )}
    >
      {full ? null : (
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-subtle px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-text-strong">Piano</h1>
            <p className="text-sm text-text-muted">{describeScore(placeholder)}</p>
          </div>
        </header>
      )}

      {/*
        The player owns the window: the roll takes whatever is left after the
        bar, and the gallery below scrolls in the page rather than competing
        with it for height, which is what flattened the roll when both were
        flex children of one column.
      */}
      <main className={cn('flex shrink-0 flex-col', full ? 'h-full' : 'h-[78vh] min-h-[420px]')}>
        {error === null || full ? null : (
          <p className="mx-6 mt-4 rounded-(--radius) border border-danger px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <PianoRoll
          timing={timing}
          notes={notes}
          position={() => transport.position()}
          tempoScale={() => transport.tempoScale}
          leadSeconds={leadSeconds}
          strikes={transport.strikes}
          effects={effects}
          loop={loop}
          onSelectLoop={chooseLoop}
          className="min-h-0 flex-1"
        />

        <TransportBar
          className="shrink-0"
          transport={transport}
          timing={timing}
          lastTick={lastTick}
          leadSeconds={leadSeconds}
          onLeadSeconds={setLeadSeconds}
          effects={effects}
          onEffects={setEffects}
          theme={theme}
          onTheme={chooseTheme}
          full={full}
          onFull={setFull}
          onStart={() => {
            void piano.resume()
          }}
        />
      </main>

      {full ? null : (
        <div className="flex flex-col gap-10 px-6 py-8">
          <TokenGallery />

          <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border-subtle pt-4 text-xs text-text-muted">
            <SoundStatus state={soundState} />
            <span>Score format v{info?.scoreFormatVersion ?? FORMAT_VERSION}</span>
            <span>Electron {info?.electron ?? 'unavailable'}</span>
            <span>Chromium {info?.chrome ?? 'unavailable'}</span>
            <span>Node {info?.node ?? 'unavailable'}</span>
          </footer>
        </div>
      )}
    </div>
  )
}
