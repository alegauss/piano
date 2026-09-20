import { useEffect, useState } from 'react'

import { describeScore, FORMAT_VERSION, type Score } from '@piano/score-format'

import { readBridge, type PianoBridge } from './bridge'

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
  const [bridge, setBridge] = useState<PianoBridge | null>(null)

  useEffect(() => {
    setBridge(readBridge())
  }, [])

  return (
    <main className="shell">
      <h1 className="shell__title">Piano</h1>
      <p className="shell__tagline">
        Nothing plays yet. The three processes are wired and the window is real.
      </p>
      <p className="shell__score">{describeScore(placeholder)}</p>
      <dl className="shell__versions">
        <div className="shell__row">
          <dt>Score format</dt>
          <dd>v{FORMAT_VERSION}</dd>
        </div>
        <div className="shell__row">
          <dt>Electron</dt>
          <dd>{bridge?.versions.electron ?? 'unavailable'}</dd>
        </div>
        <div className="shell__row">
          <dt>Chromium</dt>
          <dd>{bridge?.versions.chrome ?? 'unavailable'}</dd>
        </div>
        <div className="shell__row">
          <dt>Node</dt>
          <dd>{bridge?.versions.node ?? 'unavailable'}</dd>
        </div>
      </dl>
    </main>
  )
}
