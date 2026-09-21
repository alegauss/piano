import type { ExportResult } from '@piano/ipc'
import type { Level, Note, Score } from '@piano/score-format'

/**
 * What saving as MIDI sends, and what the window says afterwards.
 *
 * The notes are the ones being played: at a level, that level's arrangement,
 * since that is what somebody has been hearing and practising and is what
 * they would take into a DAW. The score's own arrangements go, because a MIDI
 * file has one version of the music, and the tempo stays as written: a
 * practice tempo is a setting, not part of the piece.
 */
export function exportedScore(score: Score, playing: readonly Note[], level: Level | null): Score {
  if (level === null) {
    return score
  }
  const { arrangements: _versions, parts, ...rest } = score
  // A part the level leaves out, such as the bass under a tune played alone,
  // is not in this version at all.
  const used = new Set(playing.map((note) => note.part))
  const kept = parts?.filter((part) => used.has(part.id))
  return { ...rest, ...(kept === undefined ? {} : { parts: kept }), notes: [...playing] }
}

/**
 * The outcome in a sentence, said after the save and never asked before it:
 * somebody taking a piece into a DAW needs to know the fingerings stayed
 * behind, not to confirm it. Null where there is nothing to say.
 */
export function describeExport(result: ExportResult): string | null {
  switch (result.kind) {
    case 'cancelled':
      return null
    case 'refused':
      return `Could not save as MIDI: ${result.message}`
    case 'saved':
      return result.dropped.length === 0
        ? `Saved ${result.name}.`
        : `Saved ${result.name}. A MIDI file has nowhere to put ${result.dropped.join('; ')}.`
  }
}
