import { hero, heroSession, install, repoUrl } from '../../lib/site-content'
import { asset } from '../../lib/paths'
import { Rich } from '../ui/Rich'
import { HeroSession } from '../HeroSession'
import { Keys } from '../ui/Keys'

export function Hero() {
  return (
    <header className="hero" id="top">
      <div className="wrap">
        <img className="hero-icon" src={asset('logo.svg')} alt="Piano logo" />
        <div className="badge">
          <span className="dot" /> {hero.badge}
        </div>
        <h1>
          {hero.titleLead}
          <br />
          <span className="grad">{hero.titleAccent}</span>
        </h1>
        <p className="sub">
          <Rich runs={hero.sub} />
        </p>
        {/* The call to action is dropped from the Markdown twin by this attribute: it
            converts a reader and costs an agent the same words on every page. It scrolls to
            the install section rather than leaving, because what the plugin and the app need
            is the question between a reader and an install, and that section answers it. */}
        <div className="hero-cta" data-twin="omit">
          <a className="btn btn-primary" href="#install">
            {install.released ? install.cta : 'Install the plugin'}
          </a>
          <a className="btn btn-ghost" href={repoUrl}>
            ★ View on GitHub
          </a>
        </div>

        <div className="session-eyebrow">{heroSession.eyebrow}</div>
        <HeroSession />
        <div className="hero-meta">
          {hero.meta.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="pills">
          {hero.pills.map((runs, i) => (
            <span className="pill" key={i}>
              <Rich runs={runs} />
            </span>
          ))}
        </div>
      </div>
      <Keys />
    </header>
  )
}
