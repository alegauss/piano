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

const STORAGE_KEY = 'piano.theme'

/** Dark is the default, as the app is meant to be used in a dim room. */
export function getTheme(): ThemeName {
  return document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark'
}

export function setTheme(name: ThemeName): void {
  document.documentElement.dataset['theme'] = name
  try {
    localStorage.setItem(STORAGE_KEY, name)
  } catch {
    // Private windows and cleared site data both throw here. A theme that does
    // not persist is a small loss; a renderer that fails to start is not.
  }
}

/** Apply whatever was chosen last, before the first paint. */
export function restoreTheme(): ThemeName {
  let stored: string | null
  try {
    stored = localStorage.getItem(STORAGE_KEY)
  } catch {
    stored = null
  }
  const theme: ThemeName = stored === 'light' ? 'light' : 'dark'
  document.documentElement.dataset['theme'] = theme
  return theme
}
