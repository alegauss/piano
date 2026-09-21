import type { AppInfoResponse } from '@piano/ipc'
import {
  describeScore,
  FORMAT_VERSION,
  noteEnd,
  notesOf,
  partsOf,
  timingOf,
  type Note,
  type Score,
} from '@piano/score-format'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import { Transport, type LoopRange } from './audio'
import { readBridge } from './bridge'
import { PartsPanel } from './components/PartsPanel'
import { PianoRoll } from './components/PianoRoll'
import { SoundStatus } from './components/SoundStatus'
import { TokenGallery } from './components/TokenGallery'
import { TransportBar } from './components/TransportBar'
import { cn } from './lib/cn'
import { NOTHING_TOUCHED, playbackFilter, visibleNotes, type PartsView } from './lib/parts'
import { DEFAULT_LEAD_SECONDS, partColours } from './lib/roll'
import { appKeys } from './lib/keys-input'
import {
  calibrationKey,
  createCalibrator,
  saveInputLatency,
  savedInputLatency,
  type Latency,
} from './lib/latency'
import { playLive } from './lib/live-play'
import { appMidi } from './lib/midi-input'
import { appPiano, appSound } from './lib/sound'
import { createWaitMode } from './lib/wait-mode'
import { getTheme, setTheme, type ThemeName } from './lib/theme'

/**
 * A stand-in until PI51 can open a real file. It exists so the renderer reads
 * the score format from the shared package rather than describing a score its
 * own way, which is the drift PI2 exists to prevent.
 *
 * It carries a few notes in two parts so there is something to play, draw
 * and take apart before there is anything to open: an arpeggio in the right
 * hand over a walking bass in the left.
 */
const placeholder: Score = {
  formatVersion: FORMAT_VERSION,
  metadata: { title: 'Nothing loaded', composer: 'no composer yet' },
  parts: [
    { id: 'right', name: 'Melody', colour: 'note-part-1', role: 'melody' },
    { id: 'left', name: 'Bass', colour: 'note-part-2', role: 'bass' },
  ],
  notes: [
    ...[72, 76, 79, 84, 79, 76, 72, 76].map((pitch, index): Note => ({
      pitch,
      start: index * 240,
      duration: 220,
      velocity: 72,
      part: 'right',
      hand: 'right',
    })),
    ...[36, 43, 40, 43].map((pitch, index): Note => ({
      pitch,
      start: index * 480,
      duration: 460,
      velocity: 64,
      part: 'left',
      hand: 'left',
    })),
  ],
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
  const [partsView, setPartsView] = useState<PartsView>(NOTHING_TOUCHED)
  const [waiting, setWaiting] = useState(false)
  const sound = appSound()
  const soundState = useSyncExternalStore(sound.subscribe, () => sound.state)
  const midi = appMidi()
  const keys = appKeys()
  const midiState = useSyncExternalStore(midi.subscribe, () => midi.state)
  /** Figures measured in this session, over whatever was stored before it. */
  const [measured, setMeasured] = useState<Readonly<Record<string, number>>>({})

  const timing = useMemo(() => timingOf(placeholder), [])
  const notes = useMemo(() => notesOf(placeholder), [])
  const parts = useMemo(() => partsOf(placeholder), [])
  // Settled once from the whole piece, so hiding a part leaves the others
  // the colour they had.
  const colours = useMemo(() => partColours(notes), [notes])
  const hands = useMemo(
    () => [...new Set(notes.map((note) => note.hand).filter((hand) => hand !== undefined))],
    [notes],
  )
  const drawn = useMemo(() => visibleNotes(notes, partsView), [notes, partsView])
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

  /**
   * Which calibration applies: one figure per device and per output, since a
   * Bluetooth headset and a controller each change it.
   */
  const device = midiState.devices.find((found) => found.id === midiState.chosen)?.name ?? null
  const latencyKey = calibrationKey(device, null)
  // The figure follows the setup: choosing another controller brings back
  // what was measured with that one, and nothing if it has never been
  // measured. Derived rather than copied into state, so there is one answer.
  const stored = useMemo(() => savedInputLatency(latencyKey) ?? 0, [latencyKey])
  const latency: Latency = useMemo(
    () => ({ output: piano.outputLatency(), input: measured[latencyKey] ?? stored }),
    [piano, measured, latencyKey, stored],
  )

  const calibrator = useMemo(() => createCalibrator(piano.clicker, () => piano.now()), [piano])
  const wait = useMemo(() => createWaitMode(transport), [transport])
  const waitState = useSyncExternalStore(wait.subscribe, () => wait.state)

  // Wait mode is told the score and who is playing which part of it: the
  // notes it waits for are the ones the app has been told not to play.
  const filter = useMemo(() => playbackFilter(partsView), [partsView])
  useEffect(() => {
    wait.use(notes, filter)
  }, [wait, notes, filter])
  useEffect(() => {
    wait.setOn(waiting)
  }, [wait, waiting])
  useEffect(() => wait.close, [wait])
  // Told the lag rather than asked for it: the calibrator outlives this view.
  useEffect(() => {
    calibrator.useLatency(latency)
  }, [calibrator, latency])

  // What a player presses reaches the piano, from either input, at the pitch
  // pressed and at the clock's now.
  useEffect(() => {
    const sound = (event: Parameters<typeof playLive>[2]) => {
      void piano.resume()
      playLive(piano.engine, () => piano.now(), event)
      // A calibration in progress counts the strike, and wait mode decides
      // whether the score may move on; both take either input.
      if (event.kind === 'on') {
        calibrator.strike(piano.now())
      }
      wait.played(event)
    }
    const stopMidi = midi.onEvent(sound)
    const stopKeys = keys.onEvent(sound)
    return () => {
      stopMidi()
      stopKeys()
    }
  }, [piano, midi, keys, calibrator, wait])

  // What is heard follows the panel. The transport takes it at the next note
  // it schedules, so nothing already sounding is cut.
  useEffect(() => {
    transport.setFilter(filter)
  }, [transport, filter])

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
      <main className={cn('flex shrink-0 flex-col', full ? 'h-full' : 'h-[78vh] min-h-105')}>
        {error === null || full ? null : (
          <p className="mx-6 mt-4 rounded-(--radius) border border-danger px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="flex min-h-0 flex-1">
          {full ? null : (
            <PartsPanel
              parts={parts}
              colours={colours}
              hands={hands}
              view={partsView}
              onView={setPartsView}
            />
          )}

          <PianoRoll
            timing={timing}
            notes={drawn}
            colours={colours}
            position={() => transport.position()}
            tempoScale={() => transport.tempoScale}
            leadSeconds={leadSeconds}
            strikes={transport.strikes}
            effects={effects}
            expected={() => waitState.outstanding}
            loop={loop}
            onSelectLoop={chooseLoop}
            className="min-h-0 flex-1"
          />
        </div>

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
          midi={midi}
          keys={keys}
          waiting={waiting}
          onWaiting={setWaiting}
          latency={latency}
          calibrator={calibrator}
          latencySetup={device ?? 'the typing keyboard'}
          onMeasuredLatency={(seconds) => {
            setMeasured((held) => ({ ...held, [latencyKey]: seconds }))
            saveInputLatency(latencyKey, seconds)
          }}
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
