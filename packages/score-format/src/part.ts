import { voiceOf, type Hand, type Note } from './note'

/**
 * The unit a listener manipulates.
 *
 * The parts panel is where somebody stops being only a listener: mute this,
 * solo that, hide the other. So a part is a thing with a name and a colour,
 * not a derived grouping.
 *
 * Parts are orthogonal to hands, and that is the decision worth stating. A
 * simple piano piece is often one part whose notes are assigned to two hands;
 * an arrangement with the melody written out separately is two parts a single
 * hand may cover. Keeping them apart is what lets practice say "left hand
 * only" without caring how the score was authored, and lets the panel offer
 * "melody only" without caring which hand plays it.
 */

/** What a part is for, which is what the practice mode reduces by. */
export type PartRole = 'melody' | 'accompaniment' | 'bass' | 'other'

export type Part = {
  readonly id: string
  readonly name: string
  /**
   * A theme token name such as "note-part-1", never a colour literal. The roll
   * resolves it against the live stylesheet so it follows the theme and stays
   * distinguishable for a colour-blind viewer.
   */
  readonly colour?: string
  readonly role?: PartRole
  /** Whether the part starts visible on the roll. Muting is a session choice, not a file's. */
  readonly visible?: boolean
}

/** The part a score has when it declares none. */
export const IMPLICIT_PART_ID = 'part-1'

const IMPLICIT_PART: Part = {
  id: IMPLICIT_PART_ID,
  name: 'Piano',
  colour: 'note-part-1',
  role: 'other',
  visible: true,
}

/**
 * The parts a score plays with.
 *
 * A score that declares none gets one, because a model writing a quick melody
 * should not have to build a part table before it is allowed to play a tune.
 */
export function partsOf(score: { readonly parts?: readonly Part[] }): readonly Part[] {
  return score.parts !== undefined && score.parts.length > 0 ? score.parts : [IMPLICIT_PART]
}

/** Which part a note belongs to, with the implicit case made explicit. */
export function partOf(note: Note): string {
  return note.part ?? IMPLICIT_PART_ID
}

/** Notes grouped by part id, in the order the parts were declared. */
export function notesByPart(parts: readonly Part[], notes: readonly Note[]): Map<string, Note[]> {
  const grouped = new Map<string, Note[]>(parts.map((part) => [part.id, []]))
  for (const note of notes) {
    const id = partOf(note)
    const bucket = grouped.get(id)
    if (bucket === undefined) {
      grouped.set(id, [note])
    } else {
      bucket.push(note)
    }
  }
  return grouped
}

/**
 * What the transport should actually sound, given what the session has
 * silenced.
 *
 * Both filters exist because they are different questions. Muting a part is
 * about hearing; hiding it is about watching; and following the left hand
 * visually while hearing both is a real way to practise. Hands are filtered
 * separately from parts for the same reason they are stored separately.
 */
export type PlaybackFilter = {
  readonly mutedParts?: readonly string[]
  /** When present, only these parts sound. Solo wins over mute, as in every audio tool. */
  readonly soloParts?: readonly string[]
  /** When present, only these hands sound. */
  readonly hands?: readonly Hand[]
  /** When present, only these voices sound. */
  readonly voices?: readonly number[]
}

export function audibleNotes(notes: readonly Note[], filter: PlaybackFilter = {}): Note[] {
  const solo =
    filter.soloParts !== undefined && filter.soloParts.length > 0 ? new Set(filter.soloParts) : null
  const muted = new Set(filter.mutedParts ?? [])
  const hands = filter.hands !== undefined && filter.hands.length > 0 ? new Set(filter.hands) : null
  const voices =
    filter.voices !== undefined && filter.voices.length > 0 ? new Set(filter.voices) : null

  return notes.filter((note) => {
    const part = partOf(note)
    if (solo !== null) {
      if (!solo.has(part)) {
        return false
      }
    } else if (muted.has(part)) {
      return false
    }
    // A note with no hand is played by whoever is playing: it is not excluded
    // by a hand filter, because the score never said it belonged to one.
    if (hands !== null && note.hand !== undefined && !hands.has(note.hand)) {
      return false
    }
    if (voices !== null && !voices.has(voiceOf(note))) {
      return false
    }
    return true
  })
}

/** Problems in the part table itself, and in what the notes reference. */
export function validateParts(parts: readonly Part[], notes: readonly Note[]): string[] {
  const messages: string[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    if (part.id.trim() === '') {
      messages.push('a part has an empty id; a part is addressed by its id')
    } else if (seen.has(part.id)) {
      messages.push(`two parts share the id "${part.id}"; a part is addressed by its id`)
    }
    seen.add(part.id)

    if (part.colour !== undefined && part.colour.startsWith('#')) {
      messages.push(
        `part "${part.id}" names the colour "${part.colour}"; parts carry a theme token name such as note-part-1, so the roll follows the theme`,
      )
    }
  }

  const declared = new Set(parts.map((part) => part.id))
  const missing = new Set<string>()
  for (const note of notes) {
    const id = note.part
    if (id !== undefined && !declared.has(id) && !missing.has(id)) {
      missing.add(id)
      messages.push(`notes reference the part "${id}", which the score does not declare`)
    }
  }

  return messages
}
