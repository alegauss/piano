import { describeScore, formatProblems, LEVELS, parseScore } from '@piano/score-format'
import { z } from 'zod'

import type { Library, LibraryEntry } from './library'
import type { Link, PassageAsk } from './link'

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

function listing(entries: readonly LibraryEntry[]): ToolResult {
  if (entries.length === 0) {
    return { ok: true, text: 'The library is empty.', data: [] }
  }
  const lines = entries.map((entry) => {
    const composer = entry.metadata.composer === undefined ? '' : ` — ${entry.metadata.composer}`
    const level = entry.metadata.level === undefined ? '' : ` (${entry.metadata.level})`
    return `${entry.id}: ${entry.metadata.title}${composer}${level}`
  })
  return { ok: true, text: lines.join('\n'), data: entries }
}

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

/** What a transport answer looks like whichever command produced it. */
function fromLink(result: { ok: boolean; text: string; data?: unknown }): ToolResult {
  return { ok: result.ok, text: result.text, data: result.data }
}

export function toolsFor(library: Library, link: Link): Tool[] {
  return [
    tool({
      name: 'validate_score',
      title: 'Validate a score',
      description:
        'Check a score against the piano score format and say what is wrong with it. ' +
        'Returns the problems one by one, each naming the field and the value, so a score ' +
        'can be corrected and checked again. Validates nothing else: it does not save, ' +
        'open or play anything.',
      shape: { score: scoreArgument },
      run: ({ score }) => {
        const parsed = parseScore(score)
        return parsed.ok
          ? { ok: true, text: `Valid: ${describeScore(parsed.score)}`, data: { valid: true } }
          : {
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
          return {
            ok: true,
            text: `Saved as "${saved.id}": ${describeScore(saved.score)}`,
            data: { id: saved.id },
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
      name: 'list_scores',
      title: 'List the library',
      description:
        'Every score in the local library, easiest first, with the id each one is ' +
        'addressed by. Takes no arguments; use search_scores to narrow it.',
      shape: {},
      run: async () => listing(await library.list()),
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
      },
      run: async (filter) => listing(await library.search(filter)),
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
