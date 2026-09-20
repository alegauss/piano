import { useEffect, useRef } from 'react'

import { CANVAS_TOKENS } from '../lib/theme'
import { useCanvasPalette } from '../lib/useCanvasPalette'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'

/**
 * Every component in one place, under whichever theme is active.
 *
 * It is a working page rather than a screenshot: switching the theme here is
 * how anyone checks that a control did not keep a colour of its own, and the
 * canvas strip below is how the other half of the claim gets checked — that
 * the roll, which cannot use a Tailwind class, still draws from the same
 * tokens the chrome does.
 */
export function TokenGallery() {
  return (
    <section className="flex flex-col gap-8">
      <Row label="Button">
        <Button variant="primary">Play</Button>
        <Button variant="secondary">Loop</Button>
        <Button variant="outline">Transpose</Button>
        <Button variant="ghost">Effects</Button>
        <Button variant="danger">Stop</Button>
        <Button variant="secondary" disabled>
          Disabled
        </Button>
      </Row>

      <Row label="Switch">
        <Switch defaultChecked aria-label="Effects" />
        <Switch aria-label="Metronome" />
        <Switch disabled aria-label="Unavailable" />
      </Row>

      <Row label="Slider">
        <div className="w-64">
          <Slider defaultValue={[35]} max={100} step={1} aria-label="Position" />
        </div>
      </Row>

      <Row label="Select">
        <div className="w-48">
          <Select defaultValue="intermediate">
            <SelectTrigger aria-label="Difficulty">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Row>

      <Row label="Popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Parts</Button>
          </PopoverTrigger>
          <PopoverContent>
            <p className="text-sm text-text-muted">
              Mute, solo and colour per part arrive with PI31.
            </p>
          </PopoverContent>
        </Popover>
      </Row>

      <Row label="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Share</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Share this score</DialogTitle>
              <DialogDescription>
                Nothing to share yet. The library arrives with PI52.
              </DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      </Row>

      <Row label="Canvas">
        <CanvasSwatches />
      </Row>
    </section>
  )
}

function Row({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

/**
 * The proof that the canvas and the DOM share one palette.
 *
 * Nothing here knows a colour. It asks the document for each token and paints
 * it, so if a swatch stops matching the chrome beside it, the two have drifted
 * and this page says so immediately.
 */
function CanvasSwatches() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  // Watches the theme attribute itself, so the canvas never lags the chrome
  // when something other than the toggle changes the theme.
  const palette = useCanvasPalette()

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null) {
      return
    }
    const context = canvas.getContext('2d')
    if (context === null) {
      return
    }

    const dpr = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    context.scale(dpr, dpr)

    context.fillStyle = palette['--roll-background']
    context.fillRect(0, 0, width, height)

    const swatchWidth = width / CANVAS_TOKENS.length
    CANVAS_TOKENS.forEach((token, index) => {
      context.fillStyle = palette[token]
      context.fillRect(index * swatchWidth + 1, 6, swatchWidth - 2, height - 12)
    })
    // Redraws when the palette changes, which is whenever the theme attribute
    // does — not when one particular React state variable happens to.
  }, [palette])

  return (
    <canvas
      ref={canvasRef}
      className="h-14 w-full rounded-(--radius) border border-border-subtle"
      aria-label="Canvas tokens, drawn from the same custom properties as the chrome"
    />
  )
}
