import type { LibrarySaveResult } from '@piano/ipc'
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
  /** Free words, separated by commas, which is how anybody types a handful of tags. */
  readonly tags: string
}

/** The form as the open score would fill it, which is the prefill. */
export function filingFor(score: Score): Filing {
  return {
    title: score.metadata.title,
    composer: score.metadata.composer ?? '',
    level: score.metadata.level ?? null,
    tags: (score.metadata.tags ?? []).join(', '),
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

/**
 * The score as the form describes it.
 *
 * The three fields the form owns are replaced rather than merged: a composer
 * cleared out is a composer removed, or there would be no way to take back
 * what a MIDI file's track name claimed. Everything else the score carries —
 * its key, its arrangements, where it came from — is left exactly as it is.
 *
 * An empty title keeps the one the score had: a score with no title is one the
 * format refuses, and the form is not the place to find that out.
 */
export function withMetadata(score: Score, filing: Filing): Score {
  const { composer: _composer, level: _level, tags: _tags, ...rest } = score.metadata
  const title = filing.title.trim()
  const composer = filing.composer.trim()
  const tags = tagsOf(filing.tags)
  return {
    ...score,
    metadata: {
      ...rest,
      title: title === '' ? score.metadata.title : title,
      ...(composer === '' ? {} : { composer }),
      ...(filing.level === null ? {} : { level: filing.level }),
      ...(tags.length === 0 ? {} : { tags }),
    },
  }
}
