import type { AppInfoResponse } from '@piano/ipc'
import { describeScore, FORMAT_VERSION, type Score } from '@piano/score-format'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { readBridge } from './bridge'
import { SoundStatus } from './components/SoundStatus'
import { TokenGallery } from './components/TokenGallery'
import { Button } from './components/ui/button'
import { appSound } from './lib/sound'
import { getTheme, setTheme, type ThemeName } from './lib/theme'

/**
 * A stand-in until PI51 can open a real file. It exists so the renderer reads
 * the score format from the shared package rather than describing a score its
 * own way, which is the drift PI2 exists to prevent.
 */
const placeholder: Score = {
  formatVersion: FORMAT_VERSION,
  metadata: { title: 'Nothing loaded', composer: 'no composer yet' },
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
  const sound = appSound()
  const soundState = useSyncExternalStore(sound.subscribe, () => sound.state)

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

  function toggleTheme() {
    const next: ThemeName = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }

  return (
    <div className="flex h-full flex-col overflow-auto bg-surface-base">
      <header className="flex items-center justify-between gap-4 border-b border-border-subtle px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-strong">Piano</h1>
          <p className="text-sm text-text-muted">{describeScore(placeholder)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </header>

      <main className="flex flex-1 flex-col gap-10 px-6 py-8">
        {error !== null ? (
          <p className="rounded-(--radius) border border-danger px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <TokenGallery />

        <footer className="mt-auto flex flex-wrap gap-x-6 gap-y-1 border-t border-border-subtle pt-4 text-xs text-text-muted">
          <SoundStatus state={soundState} />
          <span>Score format v{info?.scoreFormatVersion ?? FORMAT_VERSION}</span>
          <span>Electron {info?.electron ?? 'unavailable'}</span>
          <span>Chromium {info?.chrome ?? 'unavailable'}</span>
          <span>Node {info?.node ?? 'unavailable'}</span>
        </footer>
      </main>
    </div>
  )
}
