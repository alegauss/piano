import { noteAudible, partOf, type Hand, type Note, type PlaybackFilter } from '@piano/score-format'

/**
 * Which parts and hands are heard, and which are watched.
 *
 * Muting and hiding are different questions, and keeping them apart is the
 * point of this panel: following the left hand on the roll while hearing
 * both is a real way to practise, and so is hearing one hand while watching
 * both. Solo is exclusive by convention and additive with a modifier, as in
 * every audio tool anyone has used.
 *
 * All of it belongs to the session and none of it to the file. Muting a part
 * is a way of listening, not an edit to somebody's score.
 */

export const HANDS: readonly Hand[] = ['left', 'right']

export type PartsView = {
  readonly muted: readonly string[]
  readonly soloed: readonly string[]
  readonly hidden: readonly string[]
  /** Hands not heard. A hand nobody silenced is heard, including a note with no hand at all. */
  readonly mutedHands: readonly Hand[]
  readonly hiddenHands: readonly Hand[]
  /**
   * Nothing sounds: the player has taken the whole piece. It is its own flag
   * because muting every hand cannot say it — a filter naming no hand and one
   * naming every hand are the same filter.
   */
  readonly silent?: boolean
}

export const NOTHING_TOUCHED: PartsView = {
  muted: [],
  soloed: [],
  hidden: [],
  mutedHands: [],
  hiddenHands: [],
}

/** Which hands the player takes, and what becomes of the one they do not. */
export type OtherHand = 'accompanies' | 'silent'

/**
 * The view for playing one hand: the app stops sounding what the player has
 * taken, and either accompanies with the rest or says nothing at all.
 *
 * Taking every hand is the same as taking none, because a hand filter cannot
 * express silence; that is what the silent flag is for, and it is the only
 * way to ask for a piece nobody plays but the player.
 */
export function handsView(
  view: PartsView,
  plays: readonly Hand[],
  other: OtherHand = 'accompanies',
): PartsView {
  const takes = plays.length === 0 ? HANDS : plays
  return {
    ...view,
    mutedHands: takes.length === HANDS.length ? [] : [...takes],
    silent: other === 'silent',
  }
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((held) => held !== value) : [...list, value]
}

export function toggleMuted(view: PartsView, part: string): PartsView {
  return { ...view, muted: toggle(view.muted, part) }
}

export function toggleHidden(view: PartsView, part: string): PartsView {
  return { ...view, hidden: toggle(view.hidden, part) }
}

export function toggleMutedHand(view: PartsView, hand: Hand): PartsView {
  return { ...view, mutedHands: toggle(view.mutedHands, hand) }
}

export function toggleHiddenHand(view: PartsView, hand: Hand): PartsView {
  return { ...view, hiddenHands: toggle(view.hiddenHands, hand) }
}

/**
 * Solo a part: alone by default, alongside the others with a modifier held,
 * and off again when the only part soloed is soloed a second time.
 */
export function toggleSoloed(view: PartsView, part: string, additive = false): PartsView {
  if (additive) {
    return { ...view, soloed: toggle(view.soloed, part) }
  }
  const alone = view.soloed.length === 1 && view.soloed[0] === part
  return { ...view, soloed: alone ? [] : [part] }
}

/** What the transport should play. Hiding says nothing here: it is about watching. */
export function playbackFilter(view: PartsView): PlaybackFilter {
  const heard = HANDS.filter((hand) => !view.mutedHands.includes(hand))
  return {
    mutedParts: view.muted,
    soloParts: view.soloed,
    // Naming every hand is the same as naming none, and saying nothing keeps
    // a note with no hand out of an argument it was never part of. Silencing
    // every hand is the one thing that cannot be said this way, so it is said
    // with the flag instead.
    hands: heard.length === HANDS.length ? [] : heard,
    silent: view.silent === true || heard.length === 0,
  }
}

/** Whether a note is drawn. Muting says nothing here: it is about hearing. */
export function noteVisible(note: Note, view: PartsView): boolean {
  if (view.hidden.includes(partOf(note))) {
    return false
  }
  return !(note.hand !== undefined && view.hiddenHands.includes(note.hand))
}

export function visibleNotes(notes: readonly Note[], view: PartsView): Note[] {
  return notes.filter((note) => noteVisible(note, view))
}

/** Whether a note sounds, by the same rule the scheduler applies per note. */
export function noteHeard(note: Note, view: PartsView): boolean {
  return noteAudible(note, playbackFilter(view))
}
