import { install, releasesUrl } from '../../lib/site-content'
import { Rich } from '../ui/Rich'
import { CodeLines } from '../ui/CodeLines'

// The section the argument ends in: the reader who accepted it can have the thing. The buttons
// carry data-twin="omit" for the same reason the hero's does, but the prose around them does
// not, because what the plugin needs and whether there is a release are facts an agent
// evaluating this project is right to want.
export function Install() {
  return (
    <section id="install">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="eyebrow">{install.eyebrow}</div>
          <h2>{install.heading}</h2>
          <p>
            <Rich runs={install.intro} />
          </p>
        </div>
        <div className="install-grid reveal">
          <div className="step">
            <div className="n">1</div>
            <h4>The plugin, in Claude Code</h4>
            <CodeLines lines={install.pluginLines} label="Copy the plugin install lines" />
          </div>
          <div className="step">
            <div className="n">2</div>
            <h4>{install.appHeading}</h4>
            <p>
              <Rich runs={install.app} />
            </p>
            {install.released ? (
              <div className="hero-cta" data-twin="omit" style={{ marginTop: '16px' }}>
                <a className="btn btn-primary" href={releasesUrl}>
                  {install.cta}
                </a>
                <a className="btn btn-ghost" href={releasesUrl}>
                  {install.secondary}
                </a>
              </div>
            ) : (
              <CodeLines
                lines={install.sourceLines}
                label="Copy the commands to run it from source"
              />
            )}
          </div>
        </div>
        <div className="hero-meta reveal">
          {install.facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      </div>
    </section>
  )
}
