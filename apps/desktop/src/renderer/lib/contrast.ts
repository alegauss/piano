/**
 * Colour separation as a number rather than an opinion.
 *
 * The palette carries meaning: a note against the field, an expected note
 * against a wrong one. "Looks fine to me" is not a check of that, and it is
 * especially not a check for the roughly one man in twelve who cannot use
 * hue to tell red from green. So the tokens are measured.
 *
 * Two questions are asked. Contrast is the WCAG ratio, which is what says a
 * note is visible against the field at all. Lightness separation is the same
 * ratio computed between two foreground colours, which stands in for the
 * second channel: two parts whose greys differ stay tellable apart when hue
 * has stopped helping.
 */

export type Rgb = readonly [number, number, number]

/** WCAG relative luminance, from 8-bit sRGB. */
export function luminance([red, green, blue]: Rgb): number {
  const channel = (value: number) => {
    const part = value / 255
    return part <= 0.040_45 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
}

/** The WCAG contrast ratio between two colours, from 1 (identical) to 21. */
export function contrastRatio(one: Rgb, other: Rgb): number {
  const first = luminance(one)
  const second = luminance(other)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * What a colour is in sRGB, asked of the browser.
 *
 * The tokens are written in oklch, and converting that by hand here would be
 * a second implementation of something the renderer already does exactly. So
 * the colour is painted on a pixel and the pixel is read back.
 */
export function toRgb(colour: string): Rgb {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) {
    throw new Error('no 2d context')
  }
  context.fillStyle = colour
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  return [red ?? 0, green ?? 0, blue ?? 0]
}

/** Contrast between two colours as they are written, oklch included. */
export function contrastOf(one: string, other: string): number {
  return contrastRatio(toRgb(one), toRgb(other))
}

/**
 * What the WCAG asks for, and what this palette holds itself to.
 *
 * Text is the standard 4.5. Anything drawn rather than written is held to
 * the 3 the guidelines ask of a graphical object, and two colours that only
 * have to be told apart from each other are held to 1.3, which is where a
 * difference in grey stops being a rounding error on a dim screen.
 */
export const TEXT_CONTRAST = 4.5
export const OBJECT_CONTRAST = 3
export const APART_CONTRAST = 1.3
