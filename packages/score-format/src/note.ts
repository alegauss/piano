/**
 * What a note is.
 *
 * One object serves three readers that want different things: the sampler
 * wants a pitch number and a velocity, the roll wants a position and a length,
 * and the practice mode wants a hand and a finger. Splitting them into three
 * shapes would mean three things to keep in step, so they are one, and the
 * fields nobody has filled in yet are simply absent.
 */

/** Which hand plays it. Deliberately not the same question as which part it belongs to. */
export type Hand = 'left' | 'right'

export type Finger = 1 | 2 | 3 | 4 | 5

export type Note = {
  /**
   * Stable across edits, and only needed by a score that carries arrangements,
   * which name the notes they drop. A quick melody can leave it out.
   */
  readonly id?: string
  /** MIDI pitch: 60 is middle C, the piano runs 21 to 108. */
  readonly pitch: number
  /**
   * How the pitch is written, such as "A#3" or "Bb3".
   *
   * Optional, because a pitch number is enough to play and to draw. It matters
   * for reading and for any later notation view, and where it is present the
   * validator checks it against the pitch: a spelling that disagrees is a
   * mistake somebody made, not a second opinion.
   */
  readonly spelling?: string
  /** Ticks from the start of the piece. */
  readonly start: number
  /** Ticks. A note with no duration is an error rather than an instant. */
  readonly duration: number
  /** 1 to 127, as struck. Dynamics scale this rather than replacing it. */
  readonly velocity: number
  /** Independent lines within a part. Two voices may overlap; one voice may not. */
  readonly voice?: number
  readonly hand?: Hand
  readonly finger?: Finger
  /** Which part it belongs to, by id. Absent means the score's single implicit part. */
  readonly part?: string
}

export const MIN_PITCH = 0
export const MAX_PITCH = 127
/** The 88 keys, A0 to C8. */
export const PIANO_LOWEST_PITCH = 21
export const PIANO_HIGHEST_PITCH = 108

const STEP_SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

const SPELLING = /^([A-G])(#{1,2}|b{1,2})?(-1|\d)$/

/** Where a note stops sounding. */
export function noteEnd(note: Note): number {
  return note.start + note.duration
}

/** The voice a note belongs to, with the default made explicit. */
export function voiceOf(note: Note): number {
  return note.voice ?? 0
}

/**
 * The MIDI pitch a spelling names, or null if it is not a spelling.
 *
 * Scientific pitch notation, where C4 is middle C at 60. Returned rather than
 * thrown because the caller is usually a validator collecting every problem in
 * one pass, not stopping at the first.
 */
export function spellingToPitch(spelling: string): number | null {
  const match = SPELLING.exec(spelling)
  if (match === null) {
    return null
  }
  const [, step, accidental, octaveText] = match
  if (step === undefined || octaveText === undefined) {
    return null
  }
  const semitone = STEP_SEMITONES[step]
  if (semitone === undefined) {
    return null
  }
  const alter =
    accidental === undefined
      ? 0
      : accidental.startsWith('#')
        ? accidental.length
        : -accidental.length
  const pitch = (Number(octaveText) + 1) * 12 + semitone + alter
  return pitch >= MIN_PITCH && pitch <= MAX_PITCH ? pitch : null
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/**
 * A default spelling for a pitch, sharps upward.
 *
 * Only for display where the score gave none. It is never written back into a
 * score: guessing that F# was not meant as Gb and then storing the guess is
 * how a wrong reading becomes the file's own claim.
 */
export function pitchToSpelling(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1
  const name = SHARP_NAMES[((pitch % 12) + 12) % 12] ?? 'C'
  return `${name}${String(octave)}`
}

export type NoteProblem = {
  readonly note: string
  readonly message: string
}

/** How a note is named in a problem, so a report points at something. */
export function noteRef(note: Note, index: number): string {
  return note.id ?? `note #${String(index)}`
}

/**
 * Everything wrong with one note that does not need its neighbours.
 *
 * Ranges, a duration that is not positive, and a spelling that contradicts the
 * pitch it sits beside.
 */
export function noteProblems(note: Note, index: number): NoteProblem[] {
  const problems: NoteProblem[] = []
  const ref = noteRef(note, index)

  if (!Number.isInteger(note.pitch) || note.pitch < MIN_PITCH || note.pitch > MAX_PITCH) {
    problems.push({
      note: ref,
      message: `pitch must be a whole number from 0 to 127, got ${String(note.pitch)}`,
    })
  }
  if (!Number.isInteger(note.start) || note.start < 0) {
    problems.push({
      note: ref,
      message: `start must be a tick at or after 0, got ${String(note.start)}`,
    })
  }
  if (!Number.isInteger(note.duration) || note.duration <= 0) {
    problems.push({
      note: ref,
      message: `duration must be a positive number of ticks, got ${String(note.duration)}`,
    })
  }
  if (!Number.isInteger(note.velocity) || note.velocity < 1 || note.velocity > 127) {
    problems.push({
      note: ref,
      message: `velocity must be a whole number from 1 to 127, got ${String(note.velocity)}`,
    })
  }
  if (note.spelling !== undefined) {
    const spelled = spellingToPitch(note.spelling)
    if (spelled === null) {
      problems.push({
        note: ref,
        message: `spelling "${note.spelling}" is not a note name such as A#3 or Bb3`,
      })
    } else if (spelled !== note.pitch) {
      problems.push({
        note: ref,
        message: `spelling "${note.spelling}" is pitch ${String(spelled)}, but the note says ${String(note.pitch)}`,
      })
    }
  }

  return problems
}

export type Overlap = {
  readonly first: string
  readonly second: string
  readonly pitch: number
  readonly tick: number
  readonly voice: number
}

/**
 * Two notes of the same pitch sounding at once in the same voice.
 *
 * This is an error rather than something the engine resolves, because there is
 * no right answer at playback time: one note-off arrives and nothing says
 * which note it ends. Two voices overlapping is fine and is exactly what
 * voices are for; one voice overlapping itself is a mistake in the file.
 */
export function findOverlaps(notes: readonly Note[]): Overlap[] {
  const byLine = new Map<string, { note: Note; index: number }[]>()

  notes.forEach((note, index) => {
    const key = `${String(voiceOf(note))}:${String(note.pitch)}`
    const line = byLine.get(key)
    if (line === undefined) {
      byLine.set(key, [{ note, index }])
    } else {
      line.push({ note, index })
    }
  })

  const overlaps: Overlap[] = []

  for (const line of byLine.values()) {
    line.sort((a, b) => a.note.start - b.note.start)
    for (let i = 1; i < line.length; i += 1) {
      const previous = line[i - 1]
      const current = line[i]
      if (previous === undefined || current === undefined) {
        continue
      }
      if (current.note.start < noteEnd(previous.note)) {
        overlaps.push({
          first: noteRef(previous.note, previous.index),
          second: noteRef(current.note, current.index),
          pitch: current.note.pitch,
          tick: current.note.start,
          voice: voiceOf(current.note),
        })
      }
    }
  }

  return overlaps
}

/** Every problem in a list of notes, as sentences a person or a model can act on. */
export function validateNotes(notes: readonly Note[]): string[] {
  const messages = notes.flatMap((note, index) =>
    noteProblems(note, index).map((problem) => `${problem.note}: ${problem.message}`),
  )

  for (const overlap of findOverlaps(notes)) {
    messages.push(
      `${overlap.first} and ${overlap.second} overlap on pitch ${String(overlap.pitch)} ` +
        `in voice ${String(overlap.voice)} at tick ${String(overlap.tick)}`,
    )
  }

  return messages
}
