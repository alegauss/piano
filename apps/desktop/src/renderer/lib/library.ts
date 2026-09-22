import type { LibraryCorrection, LibrarySaveResult } from '@piano/ipc'
import type { Level, Score } from '@piano/score-format'

/** Everything filing can answer except the question it asks back. */
export type Filed = Exclude<LibrarySaveResult, { kind: 'taken' }>

/**
 * What the window says after filing the open score in the library.
 *
 * Said afterwards, like the MIDI save's sentence: somebody who has just heard
 * a piece play wants it kept, not a dialog about where it is kept. The id is
 * named as well as the title, because it is what a list row and a sentence in
 * chat will both call the piece from now on — and after a clash it is the one
 * that was free rather than the one that was asked for.
 *
 * A taken id is not said here: it is a question, and it is asked in the form.
 */
export function describeFiling(result: Filed): string {
  return result.kind === 'filed'
    ? `Added ${result.title} to the library, as ${result.id}.`
    : `Could not add it to the library: ${result.message}`
}

/**
 * What the filing form holds, as text and a choice — the shape a form has,
 * rather than the shape a score has.
 */
export type Filing = {
  readonly title: string
  readonly composer: string
  readonly level: Level | null
  /**
   * One to ten as a field holds it, which is text: empty for a piece nobody
   * has graded. Carried even where the form does not show it, so filing a
   * piece an importer graded does not quietly ungrade it.
   */
  readonly difficulty: string
  /** Free words, separated by commas, which is how anybody types a handful of tags. */
  readonly tags: string
}

/** The form as the open score would fill it, which is the prefill. */
export function filingFor(score: Score): Filing {
  return filingOf(score.metadata)
}

/**
 * The form as anything that describes a piece would fill it: the open score's
 * metadata, or a library row, which says all five and nothing else. A row is
 * enough, so correcting one opens a filled form without reading the piece off
 * the disk first.
 */
export function filingOf(described: {
  readonly title: string
  readonly composer?: string
  readonly level?: Level
  readonly difficulty?: number
  readonly tags?: readonly string[]
}): Filing {
  return {
    title: described.title,
    composer: described.composer ?? '',
    level: described.level ?? null,
    difficulty: described.difficulty === undefined ? '' : String(described.difficulty),
    tags: (described.tags ?? []).join(', '),
  }
}

/** The words a comma-separated line holds, each once, in the order they were typed. */
export function tagsOf(written: string): string[] {
  const words = written
    .split(',')
    .map((word) => word.trim())
    .filter((word) => word !== '')
  return [...new Set(words)]
}

/** Minutes and seconds, as a list says how long something lasts. */
export function clock(seconds: number): string {
  const whole = Math.round(seconds)
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`
}

/** One to ten as the field holds it, or null for a piece nobody has graded. */
export function difficultyOf(written: string): number | null {
  const number = Number(written.trim())
  return written.trim() !== '' && Number.isInteger(number) && number >= 1 && number <= 10
    ? number
    : null
}

/**
 * What a filled-in form says the piece is, in the words the library keeps it
 * in. The one conversion: filing a piece and correcting one already filed ask
 * the same questions, so they must not answer them differently.
 *
 * A field left blank is left out, and leaving it out is what removes it: a
 * composer cleared is a composer taken back, or there would be no undoing what
 * a MIDI file's track name claimed.
 */
export function correctionOf(filing: Filing): LibraryCorrection {
  const composer = filing.composer.trim()
  const difficulty = difficultyOf(filing.difficulty)
  const tags = tagsOf(filing.tags)
  return {
    title: filing.title.trim(),
    ...(composer === '' ? {} : { composer }),
    ...(filing.level === null ? {} : { level: filing.level }),
    ...(difficulty === null ? {} : { difficulty }),
    ...(tags.length === 0 ? {} : { tags }),
  }
}

/**
 * The score as the form describes it, for the piece on its way in.
 *
 * Everything else the score carries — its key, its arrangements, where it came
 * from — is left exactly as it is; the fields the form owns are replaced, and
 * that is `correctionOf`'s doing.
 *
 * An empty title keeps the one the score had: a score with no title is one the
 * format refuses, and the form is not the place to find that out.
 */
export function withMetadata(score: Score, filing: Filing): Score {
  const {
    composer: _composer,
    difficulty: _difficulty,
    level: _level,
    tags: _tags,
    ...rest
  } = score.metadata
  const correction = correctionOf(filing)
  return {
    ...score,
    metadata: {
      ...rest,
      ...correction,
      ...(correction.tags === undefined ? {} : { tags: [...correction.tags] }),
      title: correction.title === '' ? score.metadata.title : correction.title,
    },
  }
}
