/**
 * The bridge between the stylesheet and the canvas.
 *
 * Tailwind classes mean nothing to a 2D context, so the piano roll cannot use
 * them. Rather than give the canvas its own colour constants — which is how
 * the two halves of the screen end up disagreeing after someone adjusts a
 * shade — it asks the document for the computed value of the same custom
 * property the chrome uses. One definition in tokens.css, two consumers.
 */

export type ThemeName = 'dark' | 'light'

/** The tokens the canvas draws with. Chrome colours go through Tailwind instead. */
export const CANVAS_TOKENS = [
  '--roll-background',
  // Bar numbers and the loop band: chrome colours the canvas also draws with.
  '--text-muted',
  '--accent',
  '--roll-bar-line',
  '--roll-beat-line',
  '--roll-strike-line',
  '--note-part-1',
  '--note-part-2',
  '--note-part-3',
  '--note-part-4',
  '--key-white',
  '--key-white-pressed',
  '--key-black',
  '--key-black-pressed',
  '--judge-expected',
  '--judge-correct',
  '--judge-wrong',
  '--judge-late',
] as const

export type CanvasToken = (typeof CANVAS_TOKENS)[number]
export type CanvasPalette = Readonly<Record<CanvasToken, string>>

/**
 * Resolve every canvas token against the live document.
 *
 * Read once per theme change rather than per frame: getComputedStyle forces
 * style resolution, and calling it inside a draw loop is how a renderer that
 * was holding 60fps stops.
 */
export function readCanvasPalette(element: HTMLElement = document.documentElement): CanvasPalette {
  const computed = getComputedStyle(element)
  const palette = {} as Record<CanvasToken, string>
  for (const token of CANVAS_TOKENS) {
    palette[token] = computed.getPropertyValue(token).trim()
  }
  return palette
}

/** Dark is the default, as the app is meant to be used in a dim room. */
export function getTheme(): ThemeName {
  return document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark'
}

/** Show a theme. Remembering it is the settings' business, not this function's. */
export function setTheme(name: ThemeName): void {
  document.documentElement.dataset['theme'] = name
}

/**
 * Apply the theme chosen last, before the first paint. Main reads it from the
 * settings and puts it in the page's address, which is the one thing a page
 * can read before anything has had time to arrive.
 */
export function restoreTheme(search: string = window.location.search): ThemeName {
  const theme: ThemeName = new URLSearchParams(search).get('theme') === 'light' ? 'light' : 'dark'
  setTheme(theme)
  return theme
}
