import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { Rich } from '../components/ui/Rich'
import { RawSvg } from '../components/ui/RawSvg'
import { FeatList } from '../components/ui/FeatList'
import { features, type FeatureRecord } from '../lib/features'
import { rollDiagram } from '../lib/diagrams'
import { href } from '../lib/paths'
import { product } from '../lib/product'

function Figure({ kind }: { kind: FeatureRecord['figure'] }) {
  if (kind === 'roll') return <RawSvg className="shot-frame reveal" markup={rollDiagram} />
  if (kind === 'excerpt') {
    return (
      <div className="reveal">
        <div className="term">
          <div className="bar">
            <i />
            <i />
            <i />
            <span>{product.excerpt.from}</span>
          </div>
          <pre>{product.excerpt.json}</pre>
        </div>
        <figcaption>
          The head of a score the app ships, cut to its first notes of {product.excerpt.notes}, when
          this page was built.
        </figcaption>
      </div>
    )
  }
  return null
}

export function FeaturePage({ record }: { record: FeatureRecord }) {
  const idx = features.findIndex((f) => f.slug === record.slug)
  const prev = idx > 0 ? features[idx - 1] : null
  const next = idx < features.length - 1 ? features[idx + 1] : null

  return (
    <>
      <Nav />
      <header className="hero page-hero" id="top">
        <div className="wrap">
          <a className="feature-back" href={href('/#features')}>
            ← All pages
          </a>
          <div className="eyebrow">{record.eyebrow}</div>
          <h1>{record.heading}</h1>
          <p className="sub">
            <Rich runs={record.lead} />
          </p>
        </div>
      </header>

      <section>
        <div className="wrap">
          {record.figure && <Figure kind={record.figure} />}
          <div className="feature-body">
            {record.sections.map((s) => (
              <div className="feature-section reveal" key={s.heading}>
                <h2>{s.heading}</h2>
                {s.body && (
                  <p>
                    <Rich runs={s.body} />
                  </p>
                )}
                {s.list && <FeatList items={s.list} />}
              </div>
            ))}
          </div>

          <div className="feature-nav reveal">
            {prev ? (
              <a className="feature-nav-link" href={href(`/features/${prev.slug}`)}>
                ← {prev.heading}
              </a>
            ) : (
              <span />
            )}
            {next ? (
              <a className="feature-nav-link next" href={href(`/features/${next.slug}`)}>
                {next.heading} →
              </a>
            ) : (
              <span />
            )}
          </div>
        </div>
      </section>

      <Footer />
    </>
  )
}
