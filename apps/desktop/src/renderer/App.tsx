import type {
  AppInfoResponse,
  LibraryItem,
  LibraryQuery,
  OpenRequest,
  OpenResult,
} from '@piano/ipc'
import {
  arrangementForLevel,
  arrangementsOf,
  describeScore,
  FORMAT_VERSION,
  isRulesWork,
  noteEnd,
  notesOf,
  parseScore,
  partsOf,
  reduceScore,
  resolveArrangement,
  timingOf,
  type Arrangement,
  type Level,
  type Note,
  type Score,
} from '@piano/score-format'
import { FileMusic } from 'lucide-react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { Transport, type LoopRange } from './audio'
import { readBridge } from './bridge'
import { LibraryPanel } from './components/LibraryPanel'
import { OpenControls } from './components/OpenControls'
import { OpenReport, type Report } from './components/OpenReport'
import { PackDownloadStatus } from './components/PackDownloadStatus'
import { PartsPanel } from './components/PartsPanel'
import { PianoRoll } from './components/PianoRoll'
import { HistoryStatus } from './components/HistoryStatus'
import { SettingsStatus } from './components/SettingsStatus'
import { SoundStatus } from './components/SoundStatus'
import { TransportBar } from './components/TransportBar'
import { Button } from './components/ui/button'
import { cn } from './lib/cn'
import {
  handsView,
  NOTHING_TOUCHED,
  playbackFilter,
  visibleNotes,
  type PartsView,
} from './lib/parts'
import { partColours } from './lib/roll'
import { runCommand, type Controls, type Opening } from './lib/commands'
import { createDrill } from './lib/drill'
import { createGrader } from './lib/grader'
import { createProgress, fingerprintOf, scoreKey } from './lib/progress'
import { appKeys } from './lib/keys-input'
import {
  describeAuthored,
  describeKept,
  describeReduction,
  handsPlayed,
  LEVEL_PRESETS,
  viewFor,
  type LevelSettings,
} from './lib/levels'
import {
  calibrationKey,
  createCalibrator,
  saveInputLatency,
  savedInputLatency,
  type Latency,
} from './lib/latency'
import { playLive } from './lib/live-play'
import { appMidi } from './lib/midi-input'
import { describeExport, exportedScore } from './lib/export'
import { outcomeOf, type Opened } from './lib/open'
import { appPackDownload } from './lib/pack-download'
import { appSettings } from './lib/settings'
import { appPiano, appSound } from './lib/sound'
import { createWaitMode } from './lib/wait-mode'
import { setTheme, type ThemeName } from './lib/theme'

/** The library as main answers it; nothing when there is no bridge to ask. */
function searchLibrary(query: LibraryQuery): Promise<LibraryItem[]> {
  return readBridge()?.libraryScores(query) ?? Promise.resolve([])
}

function libraryChanges(listener: () => void): () => void {
  return readBridge()?.onLibraryChanged(listener) ?? (() => {})
}

/**
 * The stave, fetched when somebody asks for it.
 *
 * It brings the engraver and a music font with it, a megabyte that every
 * launch would otherwise parse for a player who only ever watches the roll.
 * This is the one seam where that is cheap to avoid: SheetMusic is the only
 * importer of the drawing code, which is the only importer of VexFlow, so the
 * whole of it leaves the first chunk for the cost of a lazy import here.
 */
const SheetMusic = lazy(async () => ({
  default: (await import('./components/SheetMusic')).SheetMusic,
}))

/**
 * What the window shows before anything is opened. A score like any other,
 * read through the shared package, so the renderer never describes one its
 * own way, which is the drift PI2 exists to prevent.
 *
 * It carries a few notes in two parts so there is something to play, draw
 * and take apart before there is anything to open: an arpeggio in the right
 * hand over a walking bass in the left.
 */
const placeholder: Score = {
  formatVersion: FORMAT_VERSION,
  metadata: { id: 'placeholder', title: 'Nothing loaded', composer: 'no composer yet' },
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
  // What was chosen last time. The window is drawn once these have been read,
  // so each is where its control starts rather than a correction after it.
  const settings = appSettings()
  const remembered = useSyncExternalStore(settings.subscribe, () => settings.state)
  const { theme, leadSeconds, effects, view, sheetZoom } = remembered.settings
  const [full, setFull] = useState(false)
  const [loop, setLoop] = useState<LoopRange | null>(null)
  /** Null for the piece as written; otherwise the level chosen, last time or since. */
  const [level, setLevel] = useState<Level | null>(() => settings.state.settings.level)
  const [partsView, setPartsView] = useState<PartsView>(() =>
    level === null ? NOTHING_TOUCHED : viewFor(LEVEL_PRESETS[level], NOTHING_TOUCHED),
  )
  const [waiting, setWaiting] = useState(() =>
    level === null ? false : LEVEL_PRESETS[level].waiting,
  )
  const sound = appSound()
  const soundState = useSyncExternalStore(sound.subscribe, () => sound.state)
  const midi = appMidi()
  const keys = appKeys()
  const midiState = useSyncExternalStore(midi.subscribe, () => midi.state)
  /**
   * The piece that is open. Replaced whole, and only by a score main read and
   * validated: a file that fails to open never reaches this, so there is no
   * state in which the old piece is partly replaced by the new one.
   */
  const [score, setScore] = useState<Score>(placeholder)
  /** The file it was opened from, which is where a kept arrangement goes; none for the placeholder. */
  const [file, setFile] = useState<string | null>(null)
  /** What an open had to say: why a file was refused, or what a MIDI import guessed. */
  const [report, setReport] = useState<Report | null>(null)
  /** A file is being dragged over the window. */
  const [dragging, setDragging] = useState(false)
  /** Opens waiting for the transport to hold what they opened, settled when it does. */
  const loaded = useRef<(() => void)[]>([])
  /** What the last save said: where it went, and what the file could not keep. */
  const [notice, setNotice] = useState<string | null>(null)

  const timing = useMemo(() => timingOf(score), [score])
  const written = useMemo(() => notesOf(score), [score])
  const arrangements = useMemo(() => arrangementsOf(score), [score])
  /**
   * The piece at the level chosen: the score's own arrangement for it where
   * there is one, and one worked out from the rules where there is not. A
   * level is never a reason to have nothing to play.
   */
  const version = useMemo(() => {
    if (level === null) {
      return null
    }
    const authored = arrangementForLevel(arrangements, level)
    if (authored !== null) {
      const resolved = resolveArrangement(authored, written)
      return {
        notes: resolved.notes,
        source: isRulesWork(authored) ? describeKept() : describeAuthored(resolved.label),
        proposal: null,
      }
    }
    // The worked-out version is offered to keep only where it names every
    // note it leaves out, since that is what makes it something to correct.
    const reduced = reduceScore(score, level, LEVEL_PRESETS[level].reduction)
    return {
      notes: reduced.notes,
      source: describeReduction(reduced),
      proposal: reduced.arrangement,
    }
  }, [score, level, arrangements, written])
  const notes = version?.notes ?? written
  // Only a score file has somewhere to keep it: a MIDI file carries notes and
  // nothing about them.
  const proposal =
    file !== null && /\.(?:piano|json)$/i.test(file) ? (version?.proposal ?? null) : null
  const parts = useMemo(() => partsOf(score), [score])
  const sections = useMemo(() => score.sections ?? [], [score])
  const scoreId = useMemo(() => scoreKey(score), [score])
  const fingerprint = useMemo(() => fingerprintOf(score), [score])
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

  // One transport for the life of the window, on the one audio clock. The
  // piece is loaded into it rather than being a reason to build another:
  // changing level swaps the arrangement, and a new transport would take wait
  // mode, the grader and the position down with it.
  const piano = appPiano()
  const transport = useMemo(() => {
    const made = new Transport(piano.engine, { now: () => piano.now() }, undefined, piano.clicker)
    // The level chosen last time starts at the tempo it asks for, as choosing it would.
    const start = settings.state.settings.level
    if (start !== null) {
      made.setTempoScale(
        arrangementForLevel(arrangementsOf(placeholder), start)?.tempoScale ??
          LEVEL_PRESETS[start].tempoScale,
      )
    }
    return made
  }, [piano, settings])
  useEffect(() => {
    transport.load({ timing, notes })
    // An open that asked to be told, a tool call about to play what it
    // opened, is told now that the transport holds it and not before.
    const waiting = loaded.current
    loaded.current = []
    for (const settle of waiting) {
      settle()
    }
  }, [transport, timing, notes])

  /**
   * Which calibration applies: one figure per device and per output, since a
   * Bluetooth headset and a controller each change it.
   */
  const device = midiState.devices.find((found) => found.id === midiState.chosen)?.name ?? null
  const latencyKey = calibrationKey(device, null)
  // The figure follows the setup: choosing another controller brings back
  // what was measured with that one, and nothing if it has never been
  // measured. Derived from the settings rather than copied into state, so
  // there is one answer, and a new measurement is it at once.
  const input = savedInputLatency(remembered.settings, latencyKey) ?? 0
  const latency: Latency = useMemo(() => ({ output: piano.outputLatency(), input }), [piano, input])

  const calibrator = useMemo(() => createCalibrator(piano.clicker, () => piano.now()), [piano])
  const wait = useMemo(() => createWaitMode(transport), [transport])
  const waitState = useSyncExternalStore(wait.subscribe, () => wait.state)
  const grader = useMemo(
    () =>
      createGrader(transport, () => piano.now(), {
        strictness: settings.state.settings.strictness,
      }),
    [transport, piano, settings],
  )
  // However strictness changes — the report's buttons or a level's preset —
  // the settings follow, so it is where it was left at the next launch.
  useEffect(
    () =>
      grader.subscribe(() => {
        const now = grader.state.strictness
        if (now !== settings.state.settings.strictness) {
          settings.update({ strictness: now })
        }
      }),
    [grader, settings],
  )
  // The drill drives the transport itself and hands the keyboard back when it
  // stops, so the parts view follows it rather than the other way round.
  const progress = useMemo(() => createProgress(grader, transport), [grader, transport])
  const historyNotice = useSyncExternalStore(progress.subscribe, () => progress.notice)
  const drill = useMemo(
    () =>
      createDrill(transport, grader, {
        hands: (plays, other) => {
          setPartsView((view) => handsView(view, plays, other))
        },
        // Wait mode lets go of the transport now rather than after the next
        // render, because the drill is about to hold it at the end of its
        // passage and the last word on a hold wins.
        before: () => {
          wait.setOn(false)
          setWaiting(false)
        },
      }),
    [transport, grader, wait],
  )

  /**
   * Put an opened score in place of the open one, in one step. What belonged
   * to the old piece — a drill, a loop, which parts were muted — goes with
   * it; the level stays, because it is about the player and not the piece.
   */
  const replace = useCallback(
    (opened: Opened) => {
      drill.stop()
      transport.setLoop(null)
      setLoop(null)
      setPartsView(NOTHING_TOUCHED)
      setScore(opened.score)
      setFile(opened.name)
      setReport(
        opened.notices.length > 0
          ? { kind: 'notices', name: opened.name, notices: opened.notices }
          : null,
      )
    },
    [drill, transport],
  )

  /** Act on an answer to an open: replace the piece, or say why not and leave it. */
  const show = useCallback(
    (result: OpenResult) => {
      const outcome = outcomeOf(result)
      if (outcome.kind === 'opened') {
        replace(outcome)
      } else if (outcome.kind === 'refused') {
        setReport(outcome)
      }
    },
    [replace],
  )

  const openFrom = useCallback(
    (request: Exclude<OpenRequest, { from: 'dropped' }>) => {
      const bridge = readBridge()
      if (bridge === null) {
        return
      }
      void bridge.openScore(request).then(show, (cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    },
    [show],
  )

  /** Open a library score for Claude Code, and settle once it is the one the transport holds. */
  const openForClaude = useCallback(
    async (id: string): Promise<Opening> => {
      const bridge = readBridge()
      if (bridge === null) {
        return { ok: false, text: 'This window has no way to open files.' }
      }
      const outcome = outcomeOf(await bridge.openScore({ from: 'library', id }))
      if (outcome.kind !== 'opened') {
        return {
          ok: false,
          text: outcome.kind === 'refused' ? outcome.message : `Nothing was opened for "${id}".`,
        }
      }
      await new Promise<void>((resolve) => {
        loaded.current.push(resolve)
        replace(outcome)
      })
      return { ok: true, title: outcome.score.metadata.title }
    },
    [replace],
  )

  // Wait mode is told the score and who is playing which part of it: the
  // notes it waits for are the ones the app has been told not to play. The
  // grader is told the same thing, because those are the notes it grades.
  const filter = useMemo(() => playbackFilter(partsView), [partsView])
  useEffect(() => {
    wait.use(notes, filter)
    grader.use(timing, notes, filter)
  }, [wait, grader, timing, notes, filter])
  useEffect(() => {
    wait.setOn(waiting)
  }, [wait, waiting])
  useEffect(() => wait.close, [wait])
  useEffect(() => grader.close, [grader])
  useEffect(() => {
    drill.use(timing, sections)
  }, [drill, timing, sections])
  useEffect(() => drill.close, [drill])
  // What is practised is written down against the piece and the notes it was
  // practised against, so correcting a wrong note keeps the history and says
  // the notes have moved under it.
  useEffect(() => {
    progress.use({ score: scoreId, fingerprint, level, sections })
  }, [progress, scoreId, fingerprint, level, sections])
  // Main holds the file, so what was practised before today arrives after the
  // first paint; an attempt graded meanwhile is kept rather than overwritten.
  useEffect(() => {
    void progress.load()
  }, [progress])
  useEffect(() => progress.close, [progress])

  // Claude Code reaches the piano through main, and each command lands on the
  // controls a person uses, so a sentence and a key press cannot disagree.
  // Read through a ref, so the subscription is made once and still sees the
  // level and the chooser as they stand now.
  const controls = useRef<Controls | null>(null)

  // The menu's Save as MIDI lands here, saving what is being played now.
  const saving = useRef(saveMidi)
  useEffect(() => {
    saving.current = saveMidi
  })
  useEffect(() => {
    const bridge = readBridge()
    if (bridge === null) {
      return
    }
    return bridge.onExportRequested(() => {
      saving.current()
    })
  }, [])

  useEffect(() => {
    controls.current = {
      transport,
      timing,
      sections,
      title: score.metadata.title,
      level: () => level,
      chooseLevel,
      drill,
      wake: () => {
        void piano.resume()
      },
      open: openForClaude,
    }
  })
  useEffect(() => {
    const bridge = readBridge()
    if (bridge === null) {
      return
    }
    return bridge.onLinkCommand(({ id, command }) => {
      const current = controls.current
      void (async () => {
        const result =
          current === null
            ? { ok: false, text: 'The piano window is still starting. Ask again in a moment.' }
            : await runCommand(command, current).catch((cause: unknown) => ({
                ok: false,
                text: `The window could not do that: ${cause instanceof Error ? cause.message : String(cause)}`,
              }))
        await bridge.answerLinkCommand({ id, result })
      })()
    })
  }, [])

  // A score opened from outside the page arrives here: the menu, the file
  // manager, a second launch. Then the window asks for whatever it was started
  // to open, which it does only now that it is listening for the answer.
  useEffect(() => {
    const bridge = readBridge()
    if (bridge === null) {
      return
    }
    const stop = bridge.onScoreOpened(show)
    void bridge.openScore({ from: 'launch' }).then(show, () => {})
    return stop
  }, [show])

  // A file dropped anywhere on the window opens. Every drag carrying files is
  // caught, because one that is not becomes a navigation to the file.
  useEffect(() => {
    const bridge = readBridge()
    if (bridge === null) {
      return
    }
    const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) {
        return
      }
      event.preventDefault()
      if (event.dataTransfer !== null) {
        event.dataTransfer.dropEffect = 'copy'
      }
      setDragging(true)
    }
    const leave = (event: DragEvent) => {
      // Moving from one element to another inside the window is not leaving it.
      if (event.relatedTarget === null) {
        setDragging(false)
      }
    }
    const drop = (event: DragEvent) => {
      event.preventDefault()
      setDragging(false)
      const file = event.dataTransfer?.files[0]
      if (file !== undefined) {
        void bridge.openDroppedFile(file).then(show, () => {})
      }
    }
    window.addEventListener('dragenter', over)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', over)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [show])

  // The title belongs to main; the renderer asks for it by intent.
  useEffect(() => {
    const bridge = readBridge()
    if (bridge === null) {
      return
    }
    const title = `Piano — ${describeScore(score)}`.slice(0, 200)
    void bridge.setWindowTitle({ title }).catch(() => {})
  }, [score])

  // Told the lag rather than asked for it: the calibrator and the grader both
  // outlive this view.
  useEffect(() => {
    calibrator.useLatency(latency)
    grader.useLatency(latency)
  }, [calibrator, grader, latency])

  // What a player presses reaches the piano, from either input, at the pitch
  // pressed and at the clock's now. Only the controller can say how hard, so
  // only what comes from it is graded for touch.
  useEffect(() => {
    const sound = (expressive: boolean) => (event: Parameters<typeof playLive>[2]) => {
      void piano.resume()
      playLive(piano.engine, () => piano.now(), event)
      // A calibration in progress counts the strike, wait mode decides whether
      // the score may move on, and the grader writes it down; all three take
      // either input.
      if (event.kind === 'on') {
        calibrator.strike(piano.now())
      }
      wait.played(event)
      grader.played(event, expressive)
    }
    const stopMidi = midi.onEvent(sound(true))
    const stopKeys = keys.onEvent(sound(false))
    return () => {
      stopMidi()
      stopKeys()
    }
  }, [piano, midi, keys, calibrator, wait, grader])

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

  // With no recordings installed, what could be downloaded is asked about, so
  // the offer can say how big it is before anybody starts it.
  const download = appPackDownload()
  const downloadState = useSyncExternalStore(download.subscribe, () => download.state)
  const synthesised = soundState.kind === 'synth' || soundState.kind === 'failed'
  useEffect(() => {
    if (synthesised) {
      download.check()
    }
  }, [download, synthesised])

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

  /** Save what is being played as MIDI, main asking where, and say how it went. */
  function saveMidi(): void {
    const bridge = readBridge()
    if (bridge === null) {
      return
    }
    void bridge.exportScore({ score: exportedScore(score, notes, level), level }).then(
      (result) => {
        const said = describeExport(result)
        if (said !== null) {
          setNotice(said)
        }
      },
      (cause: unknown) => {
        setNotice(
          `Could not save as MIDI: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      },
    )
  }

  /**
   * Keep the worked-out version in the score's file, so it can be read and
   * corrected there. The score main wrote is the one shown after, as the same
   * piece rather than a new one: what is being practised stays as it was.
   */
  function keepLevel(proposal: Arrangement): void {
    const bridge = readBridge()
    if (bridge === null || level === null) {
      return
    }
    const kept = level
    void bridge.keepArrangement({ arrangement: proposal }).then(
      (result) => {
        if (result.kind === 'refused') {
          setNotice(`Could not keep the ${kept} version: ${result.message}.`)
          return
        }
        const parsed = parseScore(result.score)
        if (parsed.ok) {
          setScore(parsed.score)
        }
        setNotice(
          `Kept the ${kept} version in ${result.name}. Change it there and it stays changed.`,
        )
      },
      (cause: unknown) => {
        setNotice(
          `Could not keep the ${kept} version: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      },
    )
  }

  /**
   * Every setting back to its default. The ones held in this window's state
   * go back with them, so the reset is seen now rather than at the next launch.
   */
  async function resetSettings(): Promise<void> {
    await settings.reset()
    setLevel(null)
    setPartsView(NOTHING_TOUCHED)
    setWaiting(false)
    transport.setTempoScale(1)
    grader.setStrictness(settings.state.settings.strictness)
  }

  // The theme the settings hold is the one on screen, whoever changed it.
  useEffect(() => {
    setTheme(theme)
  }, [theme])

  function chooseTheme(next: ThemeName) {
    settings.update({ theme: next })
  }

  function chooseLoop(range: LoopRange | null) {
    setLoop(range)
    transport.setLoop(range)
  }

  /**
   * Where the level's knobs stand now. Read when the panel draws rather than
   * held in state: the tempo belongs to the transport and the window to the
   * grader, and this is the one place that wants both at once.
   */
  function levelSettings(): LevelSettings {
    return {
      tempoScale: transport.tempoScale,
      plays: handsPlayed(partsView),
      waiting,
      strictness: grader.state.strictness,
    }
  }

  /** The tempo a score's own arrangement for a level asks for, where it carries one. */
  function arrangementTempo(next: Level): number | null {
    return arrangementForLevel(arrangements, next)?.tempoScale ?? null
  }

  /**
   * Choosing a level sets every knob it names, once. Nothing here is put back
   * afterwards: a preset is where to start, and the panel says which of them
   * the session has moved since.
   */
  function chooseLevel(next: Level) {
    const preset = LEVEL_PRESETS[next]
    setLevel(next)
    settings.update({ level: next })
    setPartsView((view) => viewFor(preset, view))
    setWaiting(preset.waiting)
    grader.setStrictness(preset.strictness)
    transport.setTempoScale(arrangementTempo(next) ?? preset.tempoScale)
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
            <p className="text-sm text-text-muted">{describeScore(score)}</p>
          </div>
          {readBridge() === null ? null : (
            <div className="flex items-center gap-2">
              <LibraryPanel
                search={searchLibrary}
                changes={libraryChanges}
                onOpen={(id) => {
                  openFrom({ from: 'library', id })
                }}
              />
              <Button variant="ghost" size="sm" onClick={saveMidi}>
                <FileMusic />
                Save as MIDI
              </Button>
              <OpenControls
                open={openFrom}
                recent={() => readBridge()?.recentScores() ?? Promise.resolve([])}
              />
            </div>
          )}
        </header>
      )}

      <OpenReport
        report={report}
        open={describeScore(score)}
        onClose={() => {
          setReport(null)
        }}
      />

      {dragging ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center border-4 border-dashed border-accent bg-surface-base/80 text-lg font-semibold text-text-strong"
        >
          Drop a score or a MIDI file to open it
        </div>
      ) : null}

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

        {notice === null || full ? null : (
          <p
            role="status"
            className="mx-6 mt-4 flex items-start justify-between gap-4 rounded-(--radius) border border-border-subtle px-3 py-2 text-sm text-text-default"
          >
            {notice}
            <button
              type="button"
              className="shrink-0 text-text-muted underline hover:text-text-strong"
              onClick={() => {
                setNotice(null)
              }}
            >
              Dismiss
            </button>
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

          {/*
            One reading or the other, never both: side by side at this window
            width each would be squeezed to illegibility, and a reader wants
            the roll to see what is coming or the stave to read what is
            written. The parts panel stays put through the swap, since hiding
            a part is about the piece rather than about how it is drawn.
          */}
          {view === 'sheet' ? (
            /* A line of text rather than a spinner: the wait is one local
               import, and a spinner for it would be the longest-lived thing
               on screen. */
            <Suspense
              fallback={
                <p className="min-h-0 flex-1 px-6 py-8 text-sm text-text-muted">
                  Getting the page ready…
                </p>
              }
            >
              <SheetMusic
                timing={timing}
                notes={drawn}
                musicKey={score.metadata.key}
                position={() => transport.position()}
                tempoScale={() => transport.tempoScale}
                /* Read straight from the grader, as the roll does: it changes
                   on every note played and the page reads it every frame. */
                feedback={() => grader.state.feedback}
                className="min-h-0 flex-1"
              />
            </Suspense>
          ) : (
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
              /* Read straight from the grader rather than through React: it
                 changes on every note played and the roll reads it every frame,
                 which is not a reason to re-render the app. */
              feedback={() => grader.state.feedback}
              loop={loop}
              onSelectLoop={chooseLoop}
              className="min-h-0 flex-1"
            />
          )}
        </div>

        <TransportBar
          className="shrink-0"
          transport={transport}
          timing={timing}
          lastTick={lastTick}
          leadSeconds={leadSeconds}
          onLeadSeconds={(seconds) => {
            settings.update({ leadSeconds: seconds })
          }}
          effects={effects}
          onEffects={(on) => {
            settings.update({ effects: on })
          }}
          theme={theme}
          onTheme={chooseTheme}
          full={full}
          onFull={setFull}
          view={view}
          onView={(next) => {
            settings.update({ view: next })
          }}
          sheetZoom={sheetZoom}
          onSheetZoom={(next) => {
            settings.update({ sheetZoom: next })
          }}
          midi={midi}
          keys={keys}
          waiting={waiting}
          onWaiting={setWaiting}
          grader={grader}
          progress={progress}
          scoreKey={scoreId}
          level={level}
          levelSettings={levelSettings}
          onLevel={chooseLevel}
          arrangementTempo={arrangementTempo}
          levelSource={version?.source}
          {...(proposal === null
            ? {}
            : {
                onKeepLevel: () => {
                  keepLevel(proposal)
                },
              })}
          drill={drill}
          sections={sections}
          latency={latency}
          calibrator={calibrator}
          latencySetup={device ?? 'the typing keyboard'}
          onMeasuredLatency={(seconds) => {
            saveInputLatency(settings, latencyKey, seconds)
          }}
          onStart={() => {
            void piano.resume()
          }}
        />
      </main>

      {full ? null : (
        <div className="px-6 py-8">
          <footer className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border-subtle pt-4 text-xs text-text-muted">
            <SoundStatus state={soundState} />
            <PackDownloadStatus
              state={downloadState}
              onStart={download.start}
              onCancel={download.cancel}
            />
            <SettingsStatus
              notice={remembered.notice}
              onDismiss={settings.dismiss}
              onReset={resetSettings}
            />
            <HistoryStatus
              notice={historyNotice}
              onDismiss={progress.dismiss}
              onSave={progress.keep}
              onDelete={progress.erase}
            />
            <span data-testid="app-version">Piano {info?.app ?? 'unavailable'}</span>
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
