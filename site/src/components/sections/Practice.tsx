import { practice } from '../../lib/site-content'
import { Rich } from '../ui/Rich'
import { FeatList } from '../ui/FeatList'

export function Practice() {
  return (
    <section id="practice">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="eyebrow">{practice.eyebrow}</div>
          <h2>{practice.heading}</h2>
          <p>
            <Rich runs={practice.intro} />
          </p>
        </div>
        {/* The three cards are the app's own sentences, read out of levels.ts at build time. */}
        <div className="levels reveal">
          {practice.levels.map((l, i) => (
            <div className={`level level-${i + 1}`} key={l.level}>
              <h3>{l.label}</h3>
              <p>{l.means}</p>
            </div>
          ))}
        </div>
        <div className="practice-list reveal">
          <h3 className="list-head">{practice.listHeading}</h3>
          <FeatList items={practice.list} two />
        </div>
      </div>
    </section>
  )
}
