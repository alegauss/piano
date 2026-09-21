import { noteRef, voiceOf, type Note } from './note'

/**
 * What beginner, intermediate and advanced mean for a given piece.
 *
 * The obvious implementation is three copies, and it is wrong. The first
 * correction to a wrong note would have to be made three times, and within a
 * month the beginner version is a different piece. So a score carries one
 * authoritative note set and a list of arrangements, each of which is a
 * transformation over it rather than a copy of it.
 *
 * Resolving happens once, at load. The audio engine and the renderer are
 * handed a plain note list and never learn that levels exist.
 */

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

export type Level = (typeof LEVELS)[number]

/**
 * A change to one note that a reduction genuinely needs.
 *
 * The escape hatch that keeps the format honest: some simplifications really
 * do change the music, and pretending otherwise produces beginner parts nobody
 * can play. An override names a note by id and replaces only the fields it
 * mentions, so the rest still follows the source.
 */
export type NoteOverride = {
  readonly id: string
} & Partial<Omit<Note, 'id'>>

export type Arrangement = {
  readonly id: string
  readonly level: Level
  readonly label?: string
  /** When present, only these parts are included. */
  readonly parts?: readonly string[]
  /** When present, only these voices are included. */
  readonly voices?: readonly number[]
  /** Note ids left out entirely: ornaments, inner voices, a doubled bass. */
  readonly drop?: readonly string[]
  /** Fraction of the written tempo this level is meant to be played at. */
  readonly tempoScale?: number
  readonly overrides?: readonly NoteOverride[]
  /** Present when the reduction rules wrote it rather than a person; see Generated. */
  readonly generated?: Generated
}

/**
 * The reduction rules' signature on an arrangement they wrote.
 *
 * Kept so that the rules can tell their own work from a person's: the digest
 * is of what they wrote, so an arrangement somebody has corrected no longer
 * matches it, and from then on it is theirs. The rules replace an arrangement
 * of their own when they work the level out again, and never touch one a
 * person has changed.
 */
export type Generated = {
  /** Which rules wrote it, and which version of them. */
  readonly rules: string
  /** Of the arrangement as the rules wrote it. */
  readonly digest: string
}

/** Who writes a generated arrangement: named, so a later version can tell its predecessor's work. */
export const REDUCTION_RULES = 'piano reduction rules 1'

/**
 * A short fingerprint of what an arrangement does, in a stable order: the
 * level and every field that changes what is played, but not its label, id or
 * signature, which a person may rename without changing the music.
 */
export function arrangementDigest(arrangement: Arrangement): string {
  const content = JSON.stringify([
    arrangement.level,
    arrangement.parts ?? [],
    arrangement.voices ?? [],
    [...(arrangement.drop ?? [])].sort(),
    arrangement.tempoScale ?? null,
    [...(arrangement.overrides ?? [])]
      .map((override) => JSON.stringify(Object.entries(override).sort()))
      .sort(),
  ])
  // FNV-1a, 32 bits: enough to notice an edit, and the same on every platform.
  let hash = 0x811c9dc5
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** An arrangement, signed as the rules' own work. */
export function signedByRules(arrangement: Arrangement): Arrangement {
  const { generated: _unsigned, ...content } = arrangement
  return {
    ...content,
    generated: { rules: REDUCTION_RULES, digest: arrangementDigest(content) },
  }
}

/** Whether an arrangement is the rules' work exactly as they wrote it, which is what they may replace. */
export function isRulesWork(arrangement: Arrangement): boolean {
  return (
    arrangement.generated !== undefined &&
    arrangement.generated.digest === arrangementDigest(arrangement)
  )
}

export type Kept =
  | { readonly kept: true; readonly arrangements: readonly Arrangement[] }
  | { readonly kept: false; readonly reason: string }

/**
 * A worked-out arrangement written into a score's list, for keeping.
 *
 * Keeping is what makes the rules' proposal reviewable: until it is in the
 * file it is worked out again at every launch, and a correction has nowhere
 * to go. Once kept, the score's own arrangement is what the level plays.
 *
 * An arrangement the rules wrote for the level before, untouched since, is
 * replaced by the new one. One a person wrote or corrected is left alone and
 * the keep refused, since a score's own arrangement for a level always wins
 * over a worked-out one.
 */
export function keepArrangement(arrangements: readonly Arrangement[], proposal: Arrangement): Kept {
  const signed = signedByRules(proposal)
  const existing = arrangements.find((one) => one.level === proposal.level)
  if (existing !== undefined && !isRulesWork(existing)) {
    return {
      kept: false,
      reason: `the score already has its own ${proposal.level} arrangement, "${existing.label ?? existing.id}", and that one wins`,
    }
  }
  return {
    kept: true,
    arrangements: [...arrangements.filter((one) => one !== existing), signed],
  }
}

/**
 * Arrangements the rules wrote that name notes the score no longer carries,
 * set aside rather than refused.
 *
 * Naming a missing note is an error, and for a person's arrangement it stays
 * one, because only they know what they meant. The rules' own untouched work
 * is different: it can be worked out again from the notes as they are now, so
 * losing it costs nothing, and a score whose notes somebody edited opens
 * instead of failing over a proposal nobody made by hand.
 */
export function withoutStaleRulesWork(
  arrangements: readonly Arrangement[],
  source: readonly Note[],
): { readonly arrangements: readonly Arrangement[]; readonly setAside: readonly Arrangement[] } {
  const ids = new Set(source.map((note) => note.id).filter((id) => id !== undefined))
  const stale = (one: Arrangement) =>
    isRulesWork(one) &&
    [...(one.drop ?? []), ...(one.overrides ?? []).map((override) => override.id)].some(
      (id) => !ids.has(id),
    )
  return {
    arrangements: arrangements.filter((one) => !stale(one)),
    setAside: arrangements.filter(stale),
  }
}

export type ResolvedArrangement = {
  readonly id: string
  readonly level: Level
  readonly label: string
  readonly notes: readonly Note[]
  readonly tempoScale: number
}

/** What a score plays at when it declares no arrangements: exactly as written. */
export const AS_WRITTEN: Arrangement = {
  id: 'as-written',
  level: 'advanced',
  label: 'As written',
  tempoScale: 1,
}

/**
 * The arrangements a score offers.
 *
 * A score declaring none is valid and plays as written at advanced, which is
 * what keeps the format usable for listening without anybody authoring a
 * curriculum.
 */
export function arrangementsOf(score: {
  readonly arrangements?: readonly Arrangement[]
}): readonly Arrangement[] {
  return score.arrangements !== undefined && score.arrangements.length > 0
    ? score.arrangements
    : [AS_WRITTEN]
}

/**
 * Apply an arrangement to the source notes.
 *
 * Filter, then drop, then override, in that order: an override is meant to
 * correct a note that survived, not to resurrect one the arrangement removed.
 */
export function resolveArrangement(
  arrangement: Arrangement,
  source: readonly Note[],
): ResolvedArrangement {
  const parts = arrangement.parts !== undefined ? new Set(arrangement.parts) : null
  const voices = arrangement.voices !== undefined ? new Set(arrangement.voices) : null
  const dropped = new Set(arrangement.drop ?? [])
  const overrides = new Map((arrangement.overrides ?? []).map((o) => [o.id, o]))

  const notes: Note[] = []

  for (const note of source) {
    if (parts !== null && note.part !== undefined && !parts.has(note.part)) {
      continue
    }
    if (voices !== null && !voices.has(voiceOf(note))) {
      continue
    }
    if (note.id !== undefined && dropped.has(note.id)) {
      continue
    }

    const override = note.id === undefined ? undefined : overrides.get(note.id)
    if (override === undefined) {
      notes.push(note)
      continue
    }

    // Only the fields the override mentions change; the rest still follows the
    // source, so a corrected pitch reaches every level that did not override it.
    const { id: _ignored, ...changes } = override
    notes.push({ ...note, ...changes })
  }

  return {
    id: arrangement.id,
    level: arrangement.level,
    label: arrangement.label ?? arrangement.level,
    notes,
    tempoScale: arrangement.tempoScale ?? 1,
  }
}

/** The arrangement for a level, or the nearest thing the score offers. */
export function arrangementForLevel(
  arrangements: readonly Arrangement[],
  level: Level,
): Arrangement | null {
  return arrangements.find((arrangement) => arrangement.level === level) ?? null
}

/** Problems in the arrangement list, including references to notes that are not there. */
export function validateArrangements(
  arrangements: readonly Arrangement[],
  source: readonly Note[],
  parts: readonly { readonly id: string }[],
): string[] {
  const messages: string[] = []
  const noteIds = new Set(
    source.map((note) => note.id).filter((id): id is string => id !== undefined),
  )
  const partIds = new Set(parts.map((part) => part.id))
  const seen = new Set<string>()

  for (const arrangement of arrangements) {
    if (seen.has(arrangement.id)) {
      messages.push(`two arrangements share the id "${arrangement.id}"`)
    }
    seen.add(arrangement.id)

    if (arrangement.tempoScale !== undefined && arrangement.tempoScale <= 0) {
      messages.push(
        `arrangement "${arrangement.id}" has tempoScale ${String(arrangement.tempoScale)}; it is a fraction of the written tempo and must be above zero`,
      )
    }

    for (const part of arrangement.parts ?? []) {
      if (!partIds.has(part)) {
        messages.push(
          `arrangement "${arrangement.id}" includes the part "${part}", which the score does not declare`,
        )
      }
    }

    for (const id of arrangement.drop ?? []) {
      if (!noteIds.has(id)) {
        messages.push(
          `arrangement "${arrangement.id}" drops the note "${id}", which the score does not carry`,
        )
      }
    }

    for (const override of arrangement.overrides ?? []) {
      if (!noteIds.has(override.id)) {
        messages.push(
          `arrangement "${arrangement.id}" overrides the note "${override.id}", which the score does not carry`,
        )
      }
    }
  }

  // An arrangement that names note ids needs the notes to have them.
  const needsIds = arrangements.some(
    (a) => (a.drop?.length ?? 0) > 0 || (a.overrides?.length ?? 0) > 0,
  )
  if (needsIds) {
    const anonymous = source.filter((note) => note.id === undefined)
    if (anonymous.length > 0) {
      messages.push(
        `${String(anonymous.length)} notes have no id, but an arrangement names notes to drop or override; ` +
          `give every note an id, starting with ${noteRef(anonymous[0] as Note, source.indexOf(anonymous[0] as Note))}`,
      )
    }
  }

  return messages
}
