import type { AppInfoResponse } from '@piano/ipc'
import { describeScore, FORMAT_VERSION, type Score } from '@piano/score-format'
import { useEffect, useState } from 'react'

import { readBridge } from './bridge'

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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const bridge = readBridge()
    if (bridge === null) {
      setError('no bridge: this page is not running inside the app')
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

  return (
    <main className="shell">
      <h1 className="shell__title">Piano</h1>
      <p className="shell__tagline">
        Nothing plays yet. The three processes are wired and every call crosses a typed channel.
      </p>
      <p className="shell__score">{describeScore(placeholder)}</p>
      {error !== null ? <p className="shell__error">{error}</p> : null}
      <dl className="shell__versions">
        <div className="shell__row">
          <dt>Score format</dt>
          <dd>v{info?.scoreFormatVersion ?? FORMAT_VERSION}</dd>
        </div>
        <div className="shell__row">
          <dt>Electron</dt>
          <dd>{info?.electron ?? 'unavailable'}</dd>
        </div>
        <div className="shell__row">
          <dt>Chromium</dt>
          <dd>{info?.chrome ?? 'unavailable'}</dd>
        </div>
        <div className="shell__row">
          <dt>Node</dt>
          <dd>{info?.node ?? 'unavailable'}</dd>
        </div>
      </dl>
    </main>
  )
}
