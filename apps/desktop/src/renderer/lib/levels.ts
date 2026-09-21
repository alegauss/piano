import { LEVELS, type Hand, type Level } from '@piano/score-format'

import type { Strictness } from './grading'
import { HANDS, type PartsView } from './parts'

/**
 * What beginner, intermediate and advanced actually promise.
 *
 * Three words on a menu are decoration until each one names a value for every
 * knob it moves. So a level is a preset: a fraction of the written tempo, the
 * hands the player takes, how much of the score is kept, whether the score
 * waits, and how wide the timing window is. Somebody choosing beginner is
 * choosing all of that at once, and can see exactly what they chose.
 *
 * It is a starting point and not a cage. Every knob stays where the session
 * can reach it, because a player advanced in the left hand and a beginner in
 * the right is an ordinary person rather than an edge case; what a level owes
 * them is a sensible place to start and an honest account of what it moved.
 *
 * Three of the knobs describe a simpler version of a piece rather than a
 * setting on the app. They apply through the arrangement a score carries for
 * the level, which is the one place a reduction is written down; until a score
 * offers one, the level still plays the piece as written and says so.
 */

/** What a level asks of a simpler version of a score. */
export type Reduction = {
  /** How many voices are kept, the top one first. Null keeps what the score wrote. */
  readonly voices: number | null
  readonly ornaments: boolean
  /** Whether chords come down towards a root and one interval. */
  readonly chords: 'as written' | 'simplified'
}

export type LevelPreset = {
  readonly level: Level
  readonly label: string
  /** The level in a sentence, which is the answer to what changes between them. */
  readonly means: string
  /** Fraction of the written tempo. */
  readonly tempoScale: number
  /** The hands the player takes; the app accompanies the rest. */
  readonly plays: readonly Hand[]
  /** Whether the score waits at each note until it has been played. */
  readonly waiting: boolean
  readonly strictness: Strictness
  readonly reduction: Reduction
}

/**
 * The three levels, each naming a value for every knob.
 *
 * The numbers are written here rather than derived, because a level is a
 * judgement about people and not a formula: two thirds tempo is slow enough
 * to read ahead and fast enough to still be the piece.
 */
export const LEVEL_PRESETS: Readonly<Record<Level, LevelPreset>> = {
  beginner: {
    level: 'beginner',
    label: 'Beginner',
    means: 'The melody in one hand at two thirds tempo, with the score waiting for you.',
    tempoScale: 2 / 3,
    plays: ['right'],
    waiting: true,
    strictness: 'gentle',
    reduction: { voices: 1, ornaments: false, chords: 'simplified' },
  },
  intermediate: {
    level: 'intermediate',
    label: 'Intermediate',
    means: 'Both hands a little under tempo, playing along rather than being waited for.',
    tempoScale: 0.85,
    plays: [...HANDS],
    waiting: false,
    strictness: 'steady',
    reduction: { voices: 2, ornaments: false, chords: 'as written' },
  },
  advanced: {
    level: 'advanced',
    label: 'Advanced',
    means: 'The score as written, both hands, nothing waiting and a tight window.',
    tempoScale: 1,
    plays: [...HANDS],
    waiting: false,
    strictness: 'strict',
    reduction: { voices: null, ornaments: true, chords: 'as written' },
  },
}

export const LEVEL_ORDER: readonly Level[] = LEVELS

/** The knobs a level sets, as they stand in the session. */
export type LevelSettings = {
  readonly tempoScale: number
  readonly plays: readonly Hand[]
  readonly waiting: boolean
  readonly strictness: Strictness
}

/**
 * The hands the player has taken.
 *
 * A hand the app has been told not to sound is a hand somebody is playing, by
 * the same rule wait mode and the grader read. With nothing silenced the
 * player owes the whole piece and the app plays it too, which is what playing
 * along means.
 */
export function handsPlayed(view: PartsView): readonly Hand[] {
  return view.mutedHands.length === 0
    ? HANDS
    : HANDS.filter((hand) => view.mutedHands.includes(hand))
}

/**
 * The parts view a level asks for, over whatever the session already had.
 *
 * Naming every hand is the same as naming none: the app accompanies nothing
 * and the player owes the piece, rather than the app being asked to play
 * neither hand.
 */
export function viewFor(preset: LevelPreset, view: PartsView): PartsView {
  return {
    ...view,
    mutedHands: preset.plays.length === HANDS.length ? [] : [...preset.plays],
  }
}

/** What the session looks like under a level, before anybody moves anything. */
export function settingsFor(
  preset: LevelPreset,
  /** The arrangement the score carries for this level, which knows the piece. */
  arrangement: { readonly tempoScale?: number } | null = null,
): LevelSettings {
  return {
    tempoScale: arrangement?.tempoScale ?? preset.tempoScale,
    plays: preset.plays,
    waiting: preset.waiting,
    strictness: preset.strictness,
  }
}

/** Past this, two tempo fractions are the same one: a step of the bar is 0.05. */
const TEMPO_SLACK = 0.001

/**
 * Which knobs have been moved since the level was chosen.
 *
 * Shown rather than corrected: the app has no business putting a setting back
 * where a preset had it, and hiding the difference would make the level a
 * claim about the session that is no longer true.
 */
export function moved(under: LevelSettings, settings: LevelSettings): (keyof LevelSettings)[] {
  const changed: (keyof LevelSettings)[] = []
  if (Math.abs(under.tempoScale - settings.tempoScale) > TEMPO_SLACK) {
    changed.push('tempoScale')
  }
  if (
    under.plays.length !== settings.plays.length ||
    under.plays.some((hand) => !settings.plays.includes(hand))
  ) {
    changed.push('plays')
  }
  if (under.waiting !== settings.waiting) {
    changed.push('waiting')
  }
  if (under.strictness !== settings.strictness) {
    changed.push('strictness')
  }
  return changed
}

/** The hands somebody plays, as a person says them. */
export function describeHands(hands: readonly Hand[]): string {
  if (hands.length === HANDS.length) {
    return 'both'
  }
  return hands.length === 0 ? 'none' : hands.join(' and ')
}
