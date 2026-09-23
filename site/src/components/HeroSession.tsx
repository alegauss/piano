import { useEffect, useRef } from 'react'
import { heroSession } from '../lib/site-content'
import { Rich } from './ui/Rich'

// The hero is a session: what is sold here is a sentence to Claude Code ending in a piece you
// can play. Every step renders on the server and with no JS, so the twin and a crawler read the
// whole thing; the autoplay only reveals them one at a time after mount, which keeps the server
// render and the first client render identical.
//
// Only the reader moves the window: as each step lands the panel scrolls its own element
// (scrollTop), never scrollIntoView, which would drag a reader who has scrolled past the hero
// back to it on every step.
export function HeroSession() {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const steps = Array.from(panel.querySelectorAll<HTMLElement>('.session-step'))
    if (steps.length === 0) return

    panel.classList.add('session--playing') // CSS hides the steps until each gets .in
    let i = 0
    let timer = 0
    const tick = () => {
      if (i >= steps.length) return
      steps[i].classList.add('in')
      panel.scrollTop = panel.scrollHeight // own element only
      i += 1
      timer = window.setTimeout(tick, 1250)
    }
    timer = window.setTimeout(tick, 450)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <div className="session reveal">
      <div className="session-ask">
        <span className="session-ask-tag">You</span>
        <span className="session-ask-text">{heroSession.question}</span>
      </div>
      <div className="session-scroll" ref={panelRef}>
        {heroSession.steps.map((step) => (
          <div className="session-step" key={step.cmd}>
            {/* a <p>, so the twin keeps the call and what kind of call it is on one line */}
            <p className="session-cmd">
              <span className="session-prompt">›</span> <code>{step.cmd}</code>{' '}
              <span className="session-kind">{step.kind}</span>
            </p>
            <div className="session-out">{step.out}</div>
          </div>
        ))}
      </div>
      <div className="session-foot">
        {heroSession.foot.map((item) => (
          <span className="session-cmp" key={item}>
            {item}
          </span>
        ))}
      </div>
      <p className="session-note">
        <Rich runs={heroSession.note} />
      </p>
    </div>
  )
}
