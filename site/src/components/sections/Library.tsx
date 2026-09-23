import { library } from '../../lib/site-content'
import { Rich } from '../ui/Rich'
import { FeatList } from '../ui/FeatList'

export function Library() {
  return (
    <section id="library">
      <div className="wrap">
        <div className="split rev reveal">
          <div className="banner">
            <h2>{library.soundHeading}</h2>
            <p>
              <Rich runs={library.sound} />
            </p>
          </div>
          <div className="split-txt">
            <div className="eyebrow">{library.eyebrow}</div>
            <h2>{library.heading}</h2>
            <p>
              <Rich runs={library.intro} />
            </p>
            <FeatList items={library.list} />
          </div>
        </div>
      </div>
    </section>
  )
}
