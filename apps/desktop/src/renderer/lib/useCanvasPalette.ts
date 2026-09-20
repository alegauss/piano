import { useMemo, useSyncExternalStore } from 'react'

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
 * So the theme attribute is treated as what it is: an external store. The
 * snapshot is the theme name rather than the palette, because a snapshot has
 * to be comparable with Object.is and a fresh object every call would spin.
 * The palette is derived from it.
 */

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
  return () => {
    observer.disconnect()
  }
}

function getThemeName(): string {
  return document.documentElement.dataset['theme'] ?? 'dark'
}

export function useCanvasPalette(): CanvasPalette {
  const theme = useSyncExternalStore(subscribe, getThemeName, () => 'dark')
  // `theme` is deliberately a cache key rather than an input: the palette is
  // read from the document, and the theme name is what says the answer has
  // changed. The rule cannot see that, and removing it would freeze the
  // palette at whatever the first render resolved.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readCanvasPalette(), [theme])
}
