import {
  Accidental,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  Voice,
  VoiceMode,
} from 'vexflow/bravura'

import { STAVE_HEIGHT, type SheetPlan, type SheetStave } from './sheet'

/**
 * The plan, put on staves by VexFlow.
 *
 * Engraving is a large solved problem — glyph metrics, stems, accidental
 * placement, horizontal spacing — and none of it is what this app is about,
 * so the whole of it is the dependency's and this file is the seam. Nothing
 * here decides anything: every position, clef, meter and figure arrives in
 * the plan, and what is left is the calls that draw them.
 *
 * SVG rather than canvas, because a stave is text and lines at a fixed size
 * rather than a field redrawn every frame. It also leaves the page inspectable
 * from a test, which is how the staves and clefs are counted.
 *
 * Imported from vexflow/bravura and not from vexflow: both embed their fonts as
 * base64 rather than fetching them, which this sandboxed renderer needs, but
 * the plain entry embeds six of them and this app draws with two. The other
 * four were 391 kB of a bundle nobody asked for.
 */

/** Room inside a bar, so the last note is not drawn on the barline. */
const PADDING = 12

/**
 * Voices are soft, never strict.
 *
 * A bar whose figures do not add up to its meter is ordinary here: a triplet
 * is spelled as the nearest figure and a leftover, and a score may simply be
 * missing a beat. Strict mode throws on both, which would turn a score worth
 * reading into a blank panel.
 */
function voiceOf(stave: SheetStave): { readonly voice: Voice; readonly notes: StaveNote[] } {
  const notes = stave.notes.map((one) => {
    const note = new StaveNote({
      keys: [...one.keys],
      duration: one.duration,
      clef: stave.clef,
      dots: one.dots,
      ...(one.rest ? { type: 'r' } : {}),
    })
    // The struct's dots set how long the figure lasts; these draw them.
    for (let dot = 0; dot < one.dots; dot += 1) {
      Dot.buildAndAttach([note], { all: true })
    }
    one.accidentals.forEach((accidental, at) => {
      if (accidental !== '') {
        note.addModifier(new Accidental(accidental), at)
      }
    })
    return note
  })

  const voice = new Voice()
  voice.setMode(VoiceMode.SOFT)
  voice.addTickables(notes)
  return { voice, notes }
}

/**
 * What a drawn page leaves behind: each figure's glyph, by the id its plan
 * gave it.
 *
 * Handed back rather than looked up later, because following playback touches
 * these sixty times a second and a query selector per frame is a DOM read the
 * loop can do without.
 */
export type SheetPage = {
  readonly glyphs: ReadonlyMap<string, SVGElement>
}

/** Draw a planned page into an element, replacing whatever was there. */
export function drawSheet(host: HTMLDivElement, plan: SheetPlan): SheetPage {
  host.replaceChildren()
  const glyphs = new Map<string, SVGElement>()
  if (plan.systems.length === 0) {
    return { glyphs }
  }

  const renderer = new Renderer(host, Renderer.Backends.SVG)
  renderer.resize(plan.width, plan.height)
  const context = renderer.getContext()

  for (const system of plan.systems) {
    for (const bar of system.bars) {
      const staves: Stave[] = []
      const voices: Voice[] = []
      const drawn: StaveNote[][] = []

      bar.staves.forEach((line, at) => {
        const stave = new Stave(bar.x, system.y + at * STAVE_HEIGHT, bar.width)
        if (bar.head) {
          stave.addClef(line.clef)
          if (bar.key !== undefined) {
            stave.addKeySignature(bar.key)
          }
        }
        if (bar.meter !== undefined) {
          stave.addTimeSignature(bar.meter)
        }
        stave.setContext(context).draw()
        staves.push(stave)
        const built = voiceOf(line)
        voices.push(built.voice)
        drawn.push(built.notes)
      })

      // Joined stave by stave and formatted together, so the hands line up
      // vertically on the beat instead of each being spaced on its own.
      const formatter = new Formatter()
      for (const voice of voices) {
        formatter.joinVoices([voice])
      }
      formatter.format(voices, Math.max(bar.width - PADDING, PADDING))
      voices.forEach((voice, at) => {
        const stave = staves[at]
        if (stave !== undefined) {
          voice.draw(context, stave)
        }
      })

      // After drawing, not before: the element exists once the glyph is on
      // the page.
      bar.staves.forEach((line, at) => {
        line.notes.forEach((one, index) => {
          const element = drawn[at]?.[index]?.getSVGElement()
          if (element !== undefined) {
            glyphs.set(one.id, element)
          }
        })
      })
    }
  }

  return { glyphs }
}
