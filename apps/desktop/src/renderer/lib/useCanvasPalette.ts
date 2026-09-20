import { useEffect, useState } from 'react'

import { readCanvasPalette, type CanvasPalette } from './theme'

/**
 * The canvas palette, kept in step with whatever the document actually says.
 *
 * The obvious implementation passes the theme down as a prop and redraws when
 * it changes, and it is subtly wrong: it couples the canvas to one React state
 * variable rather than to the theme. Anything that sets data-theme without
 * going through that state — the OS changing appearance, a setting restored in
 * main, a check driving the page — leaves the chrome restyled and the canvas
 * holding the old colours. That is precisely the drift the token file exists
 * to prevent, arriving by another route.
 *
 * So this watches the attribute itself. Whoever changes the theme, and however
 * they change it, the canvas hears about it.
 */
export function useCanvasPalette(): CanvasPalette {
  const [palette, setPalette] = useState<CanvasPalette>(readCanvasPalette)

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => {
      setPalette(readCanvasPalette())
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    // The attribute may already have changed between first render and here.
    setPalette(readCanvasPalette())

    return () => {
      observer.disconnect()
    }
  }, [])

  return palette
}
