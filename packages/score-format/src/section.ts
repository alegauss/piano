import { barRangeToTicks, type ResolvedTiming } from './time'

/**
 * Somewhere to point.
 *
 * Ask Claude Code to play the chorus more slowly and something has to know
 * what the chorus is. Three features read this one list: the loop control
 * offers them as presets instead of making somebody drag two handles onto the
 * right bars, the practice tools use them as the unit of progress so the app
 * can say the bridge is what still fails, and the MCP transport tools take a
 * section id so a sentence in chat becomes a command without the model
 * inventing tick numbers.
 */

export type Section = {
  /**
   * Stable. Progress is recorded against it, so a section relabelled from
   * "chorus" to "refrain" keeps the history somebody built up practising it.
   */
  readonly id: string
  /** Free text, because musical vocabulary is not a closed set. */
  readonly label: string
  readonly startTick: number
  /** Exclusive: the first tick that is no longer in the section. */
  readonly endTick: number
  /** Nesting, so a verse can contain a phrase without repeating its bounds. */
  readonly children?: readonly Section[]
}

export type TickRange = {
  readonly start: number
  readonly end: number
}

/** Every section, parents before children, which is the order a list should show. */
export function flattenSections(sections: readonly Section[]): Section[] {
  return sections.flatMap((section) => [section, ...flattenSections(section.children ?? [])])
}

/** The range a section covers, or null if no section has that id. */
export function sectionRange(sections: readonly Section[], id: string): TickRange | null {
  const found = flattenSections(sections).find((section) => section.id === id)
  return found === null || found === undefined
    ? null
    : { start: found.startTick, end: found.endTick }
}

/**
 * What the transport should loop, given whatever the caller named.
 *
 * One function for both because there is one right answer and two callers: a
 * loop dragged on the roll and a loop asked for in a sentence must land on the
 * same ticks, or the app disagrees with itself about where the chorus is.
 */
export type RangeRequest =
  | { readonly kind: 'section'; readonly id: string }
  | { readonly kind: 'bars'; readonly from: number; readonly to: number }
  | { readonly kind: 'ticks'; readonly start: number; readonly end: number }

export function resolveRange(
  request: RangeRequest,
  timing: ResolvedTiming,
  sections: readonly Section[],
): TickRange | null {
  switch (request.kind) {
    case 'section':
      return sectionRange(sections, request.id)
    case 'bars':
      // Through the time signature map, never by multiplying: a piece that
      // changes meter would put bar 12 somewhere else.
      return barRangeToTicks(timing, request.from, request.to)
    case 'ticks':
      return {
        start: Math.min(request.start, request.end),
        end: Math.max(request.start, request.end),
      }
  }
}

/** Whether a tick falls inside a range. The end is exclusive, as a loop point is. */
export function rangeContains(range: TickRange, tick: number): boolean {
  return tick >= range.start && tick < range.end
}

/** The innermost section containing a tick, which is what "where am I" means. */
export function sectionAtTick(sections: readonly Section[], tick: number): Section | null {
  let found: Section | null = null
  for (const section of flattenSections(sections)) {
    if (
      rangeContains({ start: section.startTick, end: section.endTick }, tick) &&
      (found === null || section.endTick - section.startTick < found.endTick - found.startTick)
    ) {
      found = section
    }
  }
  return found
}

/** Problems in the section list itself. */
export function validateSections(sections: readonly Section[]): string[] {
  const messages: string[] = []
  const seen = new Set<string>()

  for (const section of flattenSections(sections)) {
    if (section.id.trim() === '') {
      messages.push('a section has an empty id; progress is recorded against the id')
    } else if (seen.has(section.id)) {
      messages.push(`two sections share the id "${section.id}"; an id addresses one passage`)
    }
    seen.add(section.id)

    if (section.endTick <= section.startTick) {
      messages.push(
        `section "${section.id}" ends at tick ${String(section.endTick)}, which is not after its start at ${String(section.startTick)}`,
      )
    }
    if (section.startTick < 0) {
      messages.push(
        `section "${section.id}" starts at tick ${String(section.startTick)}, before the piece`,
      )
    }

    for (const child of section.children ?? []) {
      if (child.startTick < section.startTick || child.endTick > section.endTick) {
        messages.push(
          `section "${child.id}" is nested inside "${section.id}" but reaches outside it`,
        )
      }
    }
  }

  return messages
}
