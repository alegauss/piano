import { useEffect, useState } from 'react'

import { readBridge, type PianoBridge } from './bridge'

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
      <dl className="shell__versions">
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
