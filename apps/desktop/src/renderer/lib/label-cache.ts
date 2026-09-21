/**
 * Small pieces of text, drawn once and blitted after that.
 *
 * Bar numbers are the same handful of glyphs frame after frame, and text is
 * the one thing on this canvas that is expensive: laying out a string means
 * shaping it, which cost thirteen milliseconds the first time it happened in
 * a frame that had four milliseconds to spare. Rendered once to an offscreen
 * canvas and copied thereafter, a label costs a blit.
 *
 * The cache is bounded and evicts the least recently used, because a long
 * piece has a lot of bar numbers and a cache that grows all evening is a
 * leak with a friendly name.
 */

const DEFAULT_LIMIT = 64

/** Room around the glyphs, so nothing is clipped by a descender or an edge. */
const PADDING = 2

export class LabelCache {
  private readonly cache = new Map<string, HTMLCanvasElement>()
  private drawn = 0

  constructor(private readonly limit: number = DEFAULT_LIMIT) {}

  /** How many labels were actually rendered: the rest were copies. */
  get renders(): number {
    return this.drawn
  }

  get size(): number {
    return this.cache.size
  }

  /** Blit a label with its top-left at x, y, rendering it if this is the first time. */
  draw(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    font: string,
    colour: string,
  ): void {
    const label = this.label(context, text, font, colour)
    if (label !== null) {
      context.drawImage(label, x, y)
    }
  }

  private label(
    context: CanvasRenderingContext2D,
    text: string,
    font: string,
    colour: string,
  ): HTMLCanvasElement | null {
    const key = `${text}\u0000${font}\u0000${colour}`
    const held = this.cache.get(key)
    if (held !== undefined) {
      // Touched, so it is the freshest rather than the next to go.
      this.cache.delete(key)
      this.cache.set(key, held)
      return held
    }

    context.font = font
    const measured = context.measureText(text)
    const height =
      measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent ||
      Number(font.slice(0, 2))
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(measured.width) + PADDING * 2
    canvas.height = Math.ceil(height) + PADDING * 2
    const own = canvas.getContext('2d')
    if (own === null) {
      return null
    }
    own.font = font
    own.textBaseline = 'top'
    own.fillStyle = colour
    own.fillText(text, PADDING, PADDING)
    this.drawn += 1

    this.cache.set(key, canvas)
    if (this.cache.size > this.limit) {
      const oldest = this.cache.keys().next()
      if (!oldest.done) {
        this.cache.delete(oldest.value)
      }
    }
    return canvas
  }
}
