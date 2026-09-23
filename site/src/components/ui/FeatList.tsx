import type { Rich as RichRuns } from '../../lib/site-content'
import { Rich } from './Rich'

/** A ticked list of rich runs; the tick is chrome and never reaches the twin. */
export function FeatList({ items, two = false }: { items: readonly RichRuns[]; two?: boolean }) {
  return (
    <ul className={two ? 'feat-list two' : 'feat-list'}>
      {items.map((runs, i) => (
        <li key={i}>
          <span className="chk">✓</span>
          <span>
            <Rich runs={runs} />
          </span>
        </li>
      ))}
    </ul>
  )
}
