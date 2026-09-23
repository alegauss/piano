import { roll } from '../../lib/site-content'
import { rollDiagram } from '../../lib/diagrams'
import { Rich } from '../ui/Rich'
import { RawSvg } from '../ui/RawSvg'
import { FeatList } from '../ui/FeatList'

export function Roll() {
  return (
    <section id="roll">
      <div className="wrap">
        <div className="split reveal">
          <figure className="shot-frame" style={{ margin: 0 }}>
            <RawSvg markup={rollDiagram} />
            <figcaption>
              <Rich runs={roll.caption} />
            </figcaption>
          </figure>
          <div className="split-txt">
            <div className="eyebrow">{roll.eyebrow}</div>
            <h2>{roll.heading}</h2>
            <p>
              <Rich runs={roll.intro} />
            </p>
            <FeatList items={roll.list} />
          </div>
        </div>
      </div>
    </section>
  )
}
