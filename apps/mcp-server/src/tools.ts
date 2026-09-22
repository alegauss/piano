import { practiceKey, type LibraryCorrection } from '@piano/ipc'
import type { Library, LibraryEntry } from '@piano/library'
import {
  describeScore,
  formatProblems,
  formatWarnings,
  LEVELS,
  parseScore,
  scoreWarnings,
  type Level,
  type ScoreMetadata,
  type ScoreWarning,
} from '@piano/score-format'
import { z } from 'zod'

import type { Link, PassageAsk } from './link'
import { noRenames, type Renames } from './renames'

/**
 * The tools Claude Code actually needs, and nothing else.
 *
 * The premise is that somebody types a sentence and a piano plays, so the
 * surface is the shape of the sentence rather than the shape of the code
 * beneath it: play this, slow it down, practise bars 17 to 20 with the left
 * hand. Every description here is written for a model reading it cold, since a
 * description that needs the source to make sense is a tool that gets called
 * wrongly and a piano that plays the wrong thing.
 *
 * What is missing is as deliberate as what is here. Nothing writes a file
 * somebody names, nothing runs a command, and the transport takes a closed set
 * of requests rather than anything that looks like code.
 */

export type ToolResult = {
  readonly ok: boolean
  /** What the caller reads. One or two sentences, in the terms it asked in. */
  readonly text: string
  /** The same answer as data, for a caller that will act on it. */
  readonly data?: unknown
}

export type Tool = {
  readonly name: string
  readonly title: string
  readonly description: string
  /** The arguments, as the protocol wants them: a field at a time. */
  readonly shape: z.ZodRawShape
  readonly run: (raw: unknown) => Promise<ToolResult>
}

/**
 * One tool, with its arguments checked before its body runs.
 *
 * The check is here rather than in each body so that every tool refuses a bad
 * call the same way, and so that the refusal says which field was wrong: the
 * caller is a model repairing its own output, and "invalid input" is not
 * something it can repair.
 */
export function tool<S extends z.ZodRawShape>(spec: {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly shape: S
  readonly run: (input: z.infer<z.ZodObject<S>>) => ToolResult | Promise<ToolResult>
}): Tool {
  const schema = z.object(spec.shape)
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    shape: spec.shape,
    run: async (raw) => {
      const parsed = schema.safeParse(raw ?? {})
      if (!parsed.success) {
        return {
          ok: false,
          text: `That call does not fit ${spec.name}: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
            .join('; ')}`,
        }
      }
      return spec.run(parsed.data)
    },
  }
}

const levels = z.enum(LEVELS)

/** A score arrives as the JSON object the format describes, never as a path. */
const scoreArgument = z
  .record(z.string(), z.unknown())
  .describe('A score, as the JSON object the piano score format describes.')

/** Minutes and seconds, as a listing says how long something lasts. */
function clock(seconds: number): string {
  const whole = Math.round(seconds)
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, '0')}`
}

function listing(entries: readonly LibraryEntry[]): ToolResult {
  if (entries.length === 0) {
    return { ok: true, text: 'The library is empty.', data: [] }
  }
  const lines = entries.map((entry) => {
    const composer = entry.metadata.composer === undefined ? '' : ` — ${entry.metadata.composer}`
    const level = entry.metadata.level === undefined ? '' : `${entry.metadata.level}, `
    return `${entry.id}: ${entry.metadata.title}${composer} (${level}${clock(entry.seconds)})`
  })
  return { ok: true, text: lines.join('\n'), data: entries }
}

const order = z
  .enum(['easiest', 'newest'])
  .optional()
  .describe(
    'easiest first, the default; or newest first, which is where a score just saved is found.',
  )

/** The passage a drill was asked for, named one way or the other but not both. */
function passageOf(
  bars: { readonly from: number; readonly to: number } | undefined,
  section: string | undefined,
): PassageAsk | null {
  if (section !== undefined) {
    return { kind: 'section', id: section }
  }
  return bars === undefined ? null : { kind: 'bars', from: bars.from, to: bars.to }
}

/**
 * What a valid score is still probably wrong about, said after the verdict.
 *
 * Only ever beside a valid result: the score is kept or passed either way,
 * and each warning names a bar and a note so the model can decide in one
 * step whether it is the music or a slip.
 */
function warned(warnings: readonly ScoreWarning[]): string {
  if (warnings.length === 0) {
    return ''
  }
  const count = warnings.length === 1 ? '1 thing' : `${String(warnings.length)} things`
  return (
    `\n\nValid, but ${count} a score usually gets wrong. Each may be what the music means; ` +
    `check them and change only the slips:\n${formatWarnings(warnings)}`
  )
}

/** A filed piece in one line, for saying which one a sentence is about. */
function describeEntry(entry: LibraryEntry): string {
  const composer = entry.metadata.composer === undefined ? '' : ` — ${entry.metadata.composer}`
  return `"${entry.metadata.title}"${composer} (${clock(entry.seconds)})`
}

/**
 * What a correction leaves the five fields saying.
 *
 * The library replaces all five, because a form fills all five in; a model
 * names the ones it means, so what it leaves out is filled from what is there
 * and only an explicit null clears one. Two calls, one rule underneath: the
 * fields that reach the library are the fields the window would have sent.
 */
function correctionOf(
  held: ScoreMetadata,
  fields: {
    readonly title?: string
    readonly composer?: string | null
    readonly level?: Level | null
    readonly difficulty?: number | null
    readonly tags?: readonly string[] | null
  },
): LibraryCorrection {
  const kept = <T>(named: T | null | undefined, was: T | undefined): T | undefined =>
    named === undefined ? was : (named ?? undefined)
  const composer = kept(fields.composer, held.composer)
  const level = kept(fields.level, held.level)
  const difficulty = kept(fields.difficulty, held.difficulty)
  const tags = kept(fields.tags, held.tags)
  return {
    title: fields.title ?? held.title,
    ...(composer === undefined ? {} : { composer }),
    ...(level === undefined ? {} : { level }),
    ...(difficulty === undefined ? {} : { difficulty }),
    ...(tags === undefined ? {} : { tags: [...tags] }),
  }
}

/** What a transport answer looks like whichever command produced it. */
function fromLink(result: { ok: boolean; text: string; data?: unknown }): ToolResult {
  return { ok: result.ok, text: result.text, data: result.data }
}

export function toolsFor(library: Library, link: Link, renames: Renames = noRenames()): Tool[] {
  return [
    tool({
      name: 'validate_score',
      title: 'Validate a score',
      description:
        'Check a score against the piano score format and say what is wrong with it. ' +
        'Returns the problems one by one, each naming the field and the value, so a score ' +
        'can be corrected and checked again. A valid score may come back with warnings: ' +
        'the hands crossing, a chord one hand cannot span, a line holding more than its ' +
        'bar, a bar going silent before its end. They are not refusals; read each and fix ' +
        'the ones that are mistakes. Validates nothing else: it does not save, open or ' +
        'play anything.',
      shape: { score: scoreArgument },
      run: ({ score }) => {
        const parsed = parseScore(score)
        if (parsed.ok) {
          const warnings = scoreWarnings(parsed.score)
          return {
            ok: true,
            text: `Valid: ${describeScore(parsed.score)}${warned(warnings)}`,
            data: { valid: true, warnings },
          }
        }
        return {
          ok: false,
          text: formatProblems(parsed.problems),
          data: { valid: false, problems: parsed.problems },
        }
      },
    }),

    tool({
      name: 'save_score',
      title: 'Save a score into the library',
      description:
        'Validate a score and keep it in the local library, where the app and the other ' +
        'tools can find it. It is filed under its metadata id, or under its title where it ' +
        'has no id, and that is the id every other tool addresses it by. An invalid score ' +
        'is refused rather than saved half-right.',
      shape: { score: scoreArgument },
      run: async ({ score }) => {
        try {
          const saved = await library.save(score)
          // Said here too, for a score saved without being validated first.
          const warnings = scoreWarnings(saved.score)
          return {
            ok: true,
            text: `Saved as "${saved.id}": ${describeScore(saved.score)}${warned(warnings)}`,
            data: { id: saved.id, warnings },
          }
        } catch (cause: unknown) {
          return { ok: false, text: cause instanceof Error ? cause.message : String(cause) }
        }
      },
    }),

    tool({
      name: 'read_score',
      title: 'Read a score back',
      description:
        'Return a score from the library as JSON, by the id it was saved under. Use ' +
        'list_scores or search_scores to find the id. Reads nothing outside the library.',
      shape: { id: z.string().min(1).describe('The id the score was saved under.') },
      run: async ({ id }) => {
        try {
          const score = await library.read(id)
          return { ok: true, text: describeScore(score), data: score }
        } catch {
          return { ok: false, text: `No score in the library is called "${id}".` }
        }
      },
    }),

    tool({
      name: 'correct_score',
      title: 'Correct what a score says about itself',
      description:
        'Change what a library score says about itself — its title, composer, level, ' +
        'difficulty or tags — without touching its notes. Name only the fields to change; ' +
        'the rest stay as they are, and null clears one. Retitling a score that has no id ' +
        'of its own moves it to the id its new title gives, and the answer says which id ' +
        'it is addressed by from now on. If that id is already another score’s, nothing ' +
        'is written and the answer says what holds it: call again with taken to file this ' +
        'one beside it or to replace what is there. The practice records kept against the ' +
        'old name follow the piece, whether the app is open or picks it up next launch.',
      shape: {
        id: z.string().min(1).describe('The id the score is filed under now.'),
        title: z.string().min(1).optional().describe('What the piece is called.'),
        composer: z.string().min(1).nullable().optional().describe('Null removes the composer.'),
        level: levels.nullable().optional(),
        difficulty: z
          .number()
          .min(1)
          .max(10)
          .nullable()
          .optional()
          .describe('One to ten, which orders the library inside a level.'),
        tags: z.array(z.string().min(1)).nullable().optional(),
        taken: z
          .enum(['beside', 'replace'])
          .optional()
          .describe(
            'Only after an answer saying the new id is taken: beside files this one under ' +
              'a numbered id, replace overwrites the score that holds it.',
          ),
      },
      run: async ({ id, taken, ...fields }) => {
        try {
          const held = await library.held(id)
          if (held === null) {
            return { ok: false, text: `No score in the library is called "${id}".` }
          }
          const metadata = correctionOf(held.metadata, fields)
          // A window holds what this side does not: the practice records kept
          // against what the piece used to be called, which a correction has
          // to move with it. So where there is one, it does the write.
          if (await link.listening()) {
            return fromLink(
              await link.send({
                kind: 'correct',
                score: id,
                metadata,
                ...(taken === undefined ? {} : { taken }),
              }),
            )
          }
          const result = await library.correct(id, metadata, taken)
          if (result.kind === 'missing') {
            return { ok: false, text: `No score in the library is called "${id}".` }
          }
          if (result.kind === 'taken') {
            return {
              ok: false,
              text:
                `"${result.id}" is already ${describeEntry(result.held)}. Call correct_score ` +
                `again with taken: "beside" to file this one under a numbered id, or ` +
                `taken: "replace" to overwrite that one.`,
              data: { taken: result.id },
            }
          }
          // The records kept against what it used to be called are the app's,
          // and the app is not here: a note is left where the two meet, and
          // the window applies it the next time it reads the history.
          await renames.moved({
            was: practiceKey(held.metadata),
            now: practiceKey(result.score.metadata),
          })
          const moved = result.id === id ? '' : ` It is addressed as "${result.id}" from now on.`
          return {
            ok: true,
            text: `Corrected "${result.id}": ${describeScore(result.score)}${moved}`,
            data: { id: result.id, metadata: result.metadata },
          }
        } catch (cause: unknown) {
          return { ok: false, text: cause instanceof Error ? cause.message : String(cause) }
        }
      },
    }),

    tool({
      name: 'delete_score',
      title: 'Delete a score from the library',
      description:
        'Take a score out of the local library, by the id it is filed under. With the app ' +
        'open the file goes to the system’s bin and can be put back. With no window open ' +
        'nothing is deleted on the first call: the answer says the file cannot go to the ' +
        'bin, and deleting it for good takes a second call with anyway. Practice records ' +
        'are left alone either way. An id nothing is filed under is refused rather than ' +
        'silently accepted.',
      shape: {
        id: z.string().min(1).describe('The id the score is filed under.'),
        anyway: z
          .boolean()
          .optional()
          .describe(
            'Only after an answer saying there is no window open and the file cannot go ' +
              'to the bin: true deletes it for good.',
          ),
      },
      run: async ({ id, anyway }) => {
        try {
          const held = await library.held(id)
          // The bin belongs to the system and only the app reaches it, so a
          // window that is there does the deleting and the file can come back.
          if (await link.listening()) {
            return fromLink(await link.send({ kind: 'remove', score: id }))
          }
          if (held !== null && anyway !== true) {
            // Nothing is written on the first ask: with no window there is no
            // bin, and a delete nobody can undo is one worth asking about.
            return {
              ok: false,
              text:
                `Nothing was deleted. The Piano app is not open, so ${describeEntry(held)} ` +
                `cannot go to the system's bin and deleting it now cannot be undone. Open ` +
                `the app and ask again, or call delete_score with anyway: true.`,
              data: { id, recoverable: false },
            }
          }
          const gone = await library.remove(id)
          if (!gone) {
            return { ok: false, text: `No score in the library is called "${id}".` }
          }
          const what = held === null ? id : describeEntry(held)
          return { ok: true, text: `Deleted "${id}": ${what}`, data: { id } }
        } catch (cause: unknown) {
          return { ok: false, text: cause instanceof Error ? cause.message : String(cause) }
        }
      },
    }),

    tool({
      name: 'list_scores',
      title: 'List the library',
      description:
        'Every score in the local library, with the id each one is addressed by and how ' +
        'long it lasts: easiest first, or newest first when asked. A score copied into the ' +
        'library folder by hand is listed too. Use search_scores to narrow it.',
      shape: { order },
      run: async ({ order: sort }) => listing(await library.list(sort)),
    }),

    tool({
      name: 'search_scores',
      title: 'Search the library',
      description:
        'Scores in the library matching what you are looking for. Text matches the title ' +
        'or the composer. Tags narrow rather than widen: naming two tags finds the scores ' +
        'carrying both. Leaving everything out lists the library.',
      shape: {
        text: z.string().optional().describe('Words from the title or the composer.'),
        level: levels.optional(),
        composer: z.string().optional(),
        tags: z.array(z.string()).optional(),
        order,
      },
      run: async ({ order: sort, ...filter }) => listing(await library.search(filter, sort)),
    }),

    tool({
      name: 'play',
      title: 'Play',
      description:
        'Start the piano playing in the open window and say what is playing. Name a library ' +
        'score to open it in the window and play it from the start; without one, what is ' +
        'open plays from where it stands. A score that cannot be opened is refused and the ' +
        'open piece is left as it was. Answers whether a window was listening.',
      shape: {
        score: z
          .string()
          .optional()
          .describe('The id of a library score to open and play, as save_score reported it.'),
      },
      run: async ({ score }) => fromLink(await link.send({ kind: 'play', score })),
    }),

    tool({
      name: 'stop',
      title: 'Stop',
      description:
        'Stop the piano. The position goes back to the start of the piece, or to the start ' +
        'of the passage where one is being repeated, so playing again starts from there ' +
        'rather than from where it stopped.',
      shape: {},
      run: async () => fromLink(await link.send({ kind: 'stop' })),
    }),

    tool({
      name: 'seek',
      title: 'Go to a bar or a passage',
      description:
        'Move the position to a bar number or to a named section of the score, without ' +
        'starting or stopping playback. Bars are counted as a musician counts them, with ' +
        'the first full bar as bar 1. Name one or the other, not both.',
      shape: {
        bar: z.number().int().min(0).optional(),
        section: z.string().optional().describe('The id of a section the score declares.'),
      },
      run: async ({ bar, section }) => {
        if ((bar === undefined) === (section === undefined)) {
          return { ok: false, text: 'Name either a bar or a section, and not both.' }
        }
        return fromLink(await link.send({ kind: 'seek', bar, section }))
      },
    }),

    tool({
      name: 'set_tempo',
      title: 'Set the practice tempo',
      description:
        'Play at a fraction of the written tempo: 0.5 is half speed, 1 is as written. ' +
        'It changes how fast the piece is played, never what is written in it.',
      shape: {
        scale: z.number().min(0.25).max(2).describe('A multiple of the written tempo.'),
      },
      run: async ({ scale }) => fromLink(await link.send({ kind: 'tempo', scale })),
    }),

    tool({
      name: 'set_transpose',
      title: 'Transpose',
      description:
        'Move everything the app plays by a number of semitones, up or down, up to two ' +
        'octaves either way. The score keeps what is written; only what sounds moves.',
      shape: { semitones: z.number().int().min(-24).max(24) },
      run: async ({ semitones }) => fromLink(await link.send({ kind: 'transpose', semitones })),
    }),

    tool({
      name: 'set_level',
      title: 'Set the difficulty level',
      description:
        'Choose beginner, intermediate or advanced. A level sets the tempo, which hands ' +
        'the player takes, how strictly timing is judged, whether the score waits, and how ' +
        'much of the piece is simplified. Every one of those stays adjustable afterwards.',
      shape: { level: levels },
      run: async ({ level }) => fromLink(await link.send({ kind: 'level', level })),
    }),

    tool({
      name: 'piano_state',
      title: 'What the piano is doing',
      description:
        'What is open and what it is doing: the score, whether it is playing, where the ' +
        'position is, the tempo and the level. Ask this before assuming a previous call ' +
        'took effect.',
      shape: {},
      run: async () => fromLink(await link.send({ kind: 'state' })),
    }),

    tool({
      name: 'practise',
      title: 'Practise a passage',
      description:
        'Repeat a passage, graded, at a tempo that climbs. Each repetition is judged: a ' +
        'clean one is followed by a faster one and a repetition with a wrong or missed note ' +
        'drops back a step. Name the passage as bars or as a section of the score, the hands ' +
        'the player takes, and where the tempo starts. "Left hand only, bars 17 to 20, ' +
        'starting at half tempo and climbing" is one call.',
      shape: {
        bars: z
          .object({ from: z.number().int().min(0), to: z.number().int().min(0) })
          .optional()
          .describe('A run of bars, both ends included.'),
        section: z.string().optional().describe('The id of a section the score declares.'),
        hands: z.array(z.enum(['left', 'right'])).optional(),
        other: z
          .enum(['accompanies', 'silent'])
          .optional()
          .describe('What the hand the player has not taken does. Accompanies, by default.'),
        from: z.number().min(0.25).max(1).optional().describe('Where the tempo starts.'),
        step: z.number().min(0.01).max(0.5).optional().describe('What a clean repetition adds.'),
        to: z.number().min(0.25).max(1).optional().describe('Where the climb stops.'),
        countIn: z.boolean().optional(),
      },
      run: async ({ bars, section, ...rest }) => {
        const passage = passageOf(bars, section)
        if (passage === null) {
          return { ok: false, text: 'Name the passage to practise, as bars or as a section.' }
        }
        return fromLink(await link.send({ kind: 'practise', drill: { passage, ...rest } }))
      },
    }),
  ]
}
