import { useAds } from '../../lib/ads'

/** The four layouts japode-ads draws. The site places the one that suits a full column. */
type AdFormat = 'in-content' | 'footer' | 'sidebar' | 'strip'

/**
 * One house ad slot.
 *
 * The container is rendered server-side and stays empty: the loader attaches a shadow root to
 * it and draws inside that, so the site stylesheet cannot reach the banner and the banner
 * cannot leak into the page. The box it will occupy is reserved in index.css, at the height
 * the loader reserves, so nothing moves when it arrives, and when the catalogue cannot be read
 * the loader collapses the slot itself.
 */
export function Ad({ format = 'in-content', slot }: { format?: AdFormat; slot: string }) {
  useAds()

  return (
    // Dropped from the Markdown twin for the reason the call to action is: an agent sent to
    // evaluate Piano is not the reader this is for.
    <div className="ad-band" data-twin="omit">
      <div className="wrap">
        <div
          className="ad"
          data-japode-ads=""
          data-ad-format={format}
          data-ad-slot={slot}
          // the loader then touches no localStorage, so there is no recency memory to declare
          data-ad-memory="off"
          // never advertise this project on its own page
          data-ad-exclude="piano"
        />
      </div>
    </div>
  )
}
