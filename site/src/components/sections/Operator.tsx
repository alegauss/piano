import { operator } from '../../lib/site-content'
import { Rich } from '../ui/Rich'

// Who does what, then the rules the app is built on.
export function Operator() {
  return (
    <section id="claude">
      <div className="wrap">
        <div className="sec-head reveal">
          <div className="eyebrow">{operator.eyebrow}</div>
          <h2>{operator.heading}</h2>
          <p>
            <Rich runs={operator.intro} />
          </p>
        </div>

        <div className="actors reveal">
          {operator.actors.map((actor, i) => (
            <div className={i === 0 ? 'actor actor-agent' : 'actor'} key={actor.who}>
              <div className="actor-head">
                <span className="actor-who">{actor.who}</span>
                <span className="actor-sub">{actor.sub}</span>
              </div>
              <div className="actor-iface">{actor.iface}</div>
              <div className="actor-job">{actor.job}</div>
            </div>
          ))}
        </div>
        <p className="actors-note reveal">
          <Rich runs={operator.actorsNote} />
        </p>

        <div className="sec-head reveal" style={{ marginTop: '72px' }}>
          <div className="eyebrow">{operator.lawsEyebrow}</div>
          <h2>{operator.lawsHeading}</h2>
          <p>
            <Rich runs={operator.lawsIntro} />
          </p>
        </div>
        <div className="laws reveal">
          {operator.laws.map((law) => (
            <div className="law" key={law.id}>
              <span className="law-id">{law.id}</span>
              <div className="law-body">
                <h3>{law.title}</h3>
                <p>{law.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
