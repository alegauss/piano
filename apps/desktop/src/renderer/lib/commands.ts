import type { Command, LinkResult } from '@piano/ipc'
import {
  barAtTick,
  flattenSections,
  sectionRange,
  tickAtBar,
  type Level,
  type RangeRequest,
  type ResolvedTiming,
  type Section,
} from '@piano/score-format'

import type { Transport } from '../audio'
import type { Drill } from './drill'
import { describeHands, LEVEL_PRESETS } from './levels'

/**
 * What a sentence in Claude Code does to the piano in front of somebody.
 *
 * Every command lands on something the window already does for a person — the
 * transport, the level chooser, the drill — rather than on a second path of
 * its own, so asking Claude Code to slow down and pressing the tempo key are
 * the same act and cannot disagree.
 *
 * Every answer is a sentence the caller can repeat to the person, in the terms
 * they asked in: bars, sections and fractions of the written tempo, never
 * ticks. A refusal says what would have worked.
 */

export type Controls = {
  readonly transport: Transport
  readonly timing: ResolvedTiming
  readonly sections: readonly Section[]
  /** What is open, as a person would name it. */
  readonly title: string
  readonly level: () => Level | null
  readonly chooseLevel: (level: Level) => void
  readonly drill: Drill
  /** Let the audio start, since a command is not a click and a platform may want one. */
  readonly wake?: () => void
  /**
   * Open a library score by its id, the way any other open goes, and settle
   * once the transport holds it. A refusal leaves the open piece where it was.
   */
  readonly open: (id: string) => Promise<Opening>
}

export type Opening =
  { readonly ok: true; readonly title: string } | { readonly ok: false; readonly text: string }

const percent = (scale: number) => `${String(Math.round(scale * 100))}%`

/** The named passages, for a refusal that has to say which ones there are. */
function known(sections: readonly Section[]): string {
  const ids = flattenSections(sections).map((one) => `"${one.id}"`)
  return ids.length === 0 ? 'This piece names no sections.' : `The sections are ${ids.join(', ')}.`
}

function barNow(controls: Controls): number {
  return barAtTick(controls.timing, controls.transport.position()).bar
}

export async function runCommand(command: Command, controls: Controls): Promise<LinkResult> {
  const { transport } = controls
  switch (command.kind) {
    case 'play': {
      if (command.score !== undefined) {
        const opened = await controls.open(command.score)
        if (!opened.ok) {
          // Playing the piece that is open when somebody asked for another
          // one is the wrong answer given confidently, so nothing plays.
          const said = /[.!?]$/.test(opened.text) ? opened.text : `${opened.text}.`
          return {
            ok: false,
            text: `${said} "${controls.title}" is still open, and nothing was played.`,
          }
        }
        controls.wake?.()
        transport.play()
        return { ok: true, text: `Opened "${opened.title}" and playing it from the start.` }
      }
      controls.wake?.()
      transport.play()
      return { ok: true, text: `Playing "${controls.title}" from bar ${String(barNow(controls))}.` }
    }

    case 'stop':
      controls.drill.stop()
      transport.stop()
      return { ok: true, text: 'Stopped.' }

    case 'seek':
      return seek(command, controls)

    case 'tempo':
      transport.setTempoScale(command.scale)
      return { ok: true, text: `Playing at ${percent(transport.tempoScale)} of the written tempo.` }

    case 'transpose':
      transport.setTranspose(command.semitones)
      return { ok: true, text: describeTranspose(transport.transpose) }

    case 'level': {
      controls.chooseLevel(command.level)
      const preset = LEVEL_PRESETS[command.level]
      return { ok: true, text: `${preset.label}: ${preset.means}` }
    }

    case 'state':
      return stateOf(controls)

    case 'practise':
      return practise(command, controls)
  }
}

function describeTranspose(by: number): string {
  if (by === 0) {
    return 'Back at the written pitch.'
  }
  return `Transposed ${String(Math.abs(by))} semitones ${by > 0 ? 'up' : 'down'}.`
}

function seek(command: Extract<Command, { kind: 'seek' }>, controls: Controls): LinkResult {
  if ((command.bar === undefined) === (command.section === undefined)) {
    return { ok: false, text: 'Name either a bar or a section, and not both.' }
  }
  if (command.section !== undefined) {
    const range = sectionRange(controls.sections, command.section)
    if (range === null) {
      return {
        ok: false,
        text: `There is no section "${command.section}". ${known(controls.sections)}`,
      }
    }
    controls.transport.seek(range.start)
    return { ok: true, text: `At the start of "${command.section}".` }
  }
  const bar = command.bar ?? 1
  controls.transport.seek(tickAtBar(controls.timing, bar))
  return { ok: true, text: `At bar ${String(bar)}.` }
}

function practise(command: Extract<Command, { kind: 'practise' }>, controls: Controls): LinkResult {
  const { passage, ...ladder } = command.drill
  const range: RangeRequest =
    passage.kind === 'section'
      ? { kind: 'section', id: passage.id }
      : { kind: 'bars', from: passage.from, to: passage.to }
  const where =
    passage.kind === 'section'
      ? `"${passage.id}"`
      : `bars ${String(passage.from)} to ${String(passage.to)}`

  controls.wake?.()
  controls.drill.start({ range, ...ladder })
  const drilling = controls.drill.state
  if (!drilling.running) {
    const why =
      passage.kind === 'section'
        ? known(controls.sections)
        : 'They are not a passage in this piece.'
    return { ok: false, text: `Could not practise ${where}. ${why}` }
  }
  const hands = `${describeHands(drilling.hands)} ${drilling.hands.length === 1 ? 'hand' : 'hands'}`
  return {
    ok: true,
    text:
      `Practising ${where}, ${hands}, from ${percent(drilling.tempoScale)} of the written ` +
      'tempo and climbing after every clean repetition.',
  }
}

function stateOf(controls: Controls): LinkResult {
  const { transport } = controls
  const level = controls.level()
  const drilling = controls.drill.state
  const data = {
    score: controls.title,
    status: transport.status,
    bar: barNow(controls),
    tempoScale: transport.tempoScale,
    transpose: transport.transpose,
    level,
    drilling: drilling.running,
  }
  const parts = [
    `"${controls.title}" is open`,
    `${transport.status} at bar ${String(data.bar)}`,
    `at ${percent(data.tempoScale)} of the written tempo`,
  ]
  if (level !== null) {
    parts.push(`level ${level}`)
  }
  if (drilling.running) {
    parts.push(`practising (repetition ${String(drilling.passes + 1)})`)
  }
  return { ok: true, text: `${parts.join(', ')}.`, data }
}
