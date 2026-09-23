import { claudeCode as cc, install, toolGroups } from '../lib/site-content'
import { product } from '../lib/product'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { Rich } from '../components/ui/Rich'
import { CodeLines } from '../components/ui/CodeLines'
import { FeatList } from '../components/ui/FeatList'

export function ClaudeCode() {
  return (
    <>
      <Nav />
      <header className="hero page-hero" id="top">
        <div className="wrap">
          <div className="eyebrow">{cc.eyebrow}</div>
          <h1>{cc.heading}</h1>
          <p className="sub">
            <Rich runs={cc.intro} />
          </p>
        </div>
      </header>

      <section>
        <div className="wrap narrow">
          <div className="sec-head reveal" style={{ marginBottom: '26px' }}>
            <h2>{cc.installHeading}</h2>
          </div>
          <div className="reveal" style={{ maxWidth: '520px', margin: '0 auto' }}>
            <CodeLines lines={install.pluginLines} label="Copy the plugin install lines" />
          </div>
          <p className="allowlist-note reveal">
            <Rich runs={cc.installNote} />
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>{cc.commandsHeading}</h2>
            <p>{cc.commandsLead}</p>
          </div>
          {/* Read out of plugin/commands at build time, name, hint and description alike. */}
          <div className="cmp-scroll reveal">
            <table className="cmp-table">
              <thead>
                <tr>
                  <th>Command</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                {product.commands.map((c) => (
                  <tr key={c.name}>
                    <td className="cmp-cap">
                      <code>{c.name}</code> <span className="cmd-hint">{c.hint}</span>
                    </td>
                    <td>{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>{cc.toolsHeading}</h2>
            <p>
              <Rich runs={cc.toolsLead} />
            </p>
          </div>
          <div className="verbs-split three">
            {toolGroups.map((group) => (
              <div className="verbs-col reveal" key={group.heading}>
                <h3 className="verbs-head">{group.heading}</h3>
                <div className="verbs">
                  {group.tools.map((t) => (
                    <div className="verb" key={t.name}>
                      {/* a <p>, so the twin keeps the tool and its title on one line */}
                      <p className="verb-head">
                        <code className="verb-name">{t.name}</code>{' '}
                        <span className="verb-title">{t.title}</span>
                      </p>
                      <span className="verb-desc">{t.summary}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap narrow">
          <div className="sec-head reveal">
            <div className="eyebrow">The skill</div>
            <h2>{cc.skillHeading}</h2>
          </div>
          <div className="reveal">
            <FeatList items={cc.skill} />
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="sec-head reveal">
            <div className="eyebrow">Scope</div>
            <h2>{cc.refusesHeading}</h2>
            <p>
              <Rich runs={cc.refusesLead} />
            </p>
          </div>
          <div className="refuses reveal">
            {cc.refuses.map((r) => (
              <div className="refuse" key={r.t}>
                <h4>
                  <em>✗</em> {r.t}
                </h4>
                <p>{r.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
