import { z } from 'zod'

/**
 * How the MCP server finds the window somebody is looking at, and what it may
 * say to it once it has.
 *
 * The server is started by Claude Code and the app by a person, so they are
 * two processes that have never met. The app leaves a small presence file in
 * a known per-user directory — where it listens, a token, its process id and
 * when it was last focused — and the server reads those files, keeps the ones
 * whose process is still alive, and speaks to the most recently focused. That
 * is the one in front of the person; the worst failure available here is a
 * tool call that succeeds while something plays in a window nobody can see.
 *
 * What travels is a closed set of commands. None carries a path, a script or
 * a tick the app did not work out itself, so the channel can do exactly the
 * eight things listed below and nothing a sentence could talk it into.
 *
 * Both ends read these schemas, which is the point of declaring them once: a
 * command the server can send is one the app can parse, by construction.
 */

/**
 * Which version of this contract a side speaks. Carried in the presence file
 * and in every request, so an old plugin meeting a new app is told which of
 * the two to update instead of meeting a validation error it cannot read.
 */
export const LINK_PROTOCOL = 1

/** The header the token travels in. */
export const TOKEN_HEADER = 'x-piano-token'

/** Where presence files live, under the person's home directory. */
export const PRESENCE_DIRECTORY = ['.piano', 'windows'] as const

/**
 * Where an installed app records where it lives, under the person's home, so
 * a tool call with no window open can start the app somebody actually
 * installed — wherever they chose to install it — rather than guess.
 */
export const APP_RECORD = ['.piano', 'app.json'] as const

export const appRecordSchema = z.object({
  /** The executable, or the application bundle on macOS. */
  executable: z.string().min(1),
  version: z.string(),
})

export type AppRecord = z.infer<typeof appRecordSchema>

/**
 * Whether a command is worth a window: everything that makes a sound or a
 * change somebody would want to see.
 *
 * The same answer decides two things. A command that needs a window is one
 * worth starting the app for when none is open, and one that brings the
 * window to the front when it is: asking for music is a reason to raise a
 * window, and asking what is open is not.
 */
export function needsWindow(command: { readonly kind: string }): boolean {
  return command.kind !== 'state'
}

/** One file per running app, named for its process so two never collide. */
export function presenceFileName(pid: number): string {
  return `window-${String(pid)}.json`
}

export function isPresenceFile(name: string): boolean {
  return /^window-\d+\.json$/.test(name)
}

export const presenceSchema = z.object({
  protocol: z.number().int(),
  /** Where the app listens: a loopback address and nothing else. */
  endpoint: z.url(),
  token: z.string().min(16),
  pid: z.number().int().positive(),
  /** Epoch milliseconds, which is what "the window the person is looking at" is decided by. */
  focusedAt: z.number(),
  /** The app's own version, for a message that has to say which side is old. */
  app: z.string(),
})

export type Presence = z.infer<typeof presenceSchema>

export const passageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), id: z.string().min(1) }),
  z.object({
    kind: z.literal('bars'),
    from: z.number().int().min(0),
    to: z.number().int().min(0),
  }),
])

/** A drill as one request: the passage, the hands and the tempo ladder. */
export const drillAskSchema = z.object({
  passage: passageSchema,
  hands: z.array(z.enum(['left', 'right'])).optional(),
  other: z.enum(['accompanies', 'silent']).optional(),
  from: z.number().min(0.25).max(1).optional(),
  step: z.number().min(0.01).max(0.5).optional(),
  to: z.number().min(0.25).max(1).optional(),
  countIn: z.boolean().optional(),
})

export const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('play'), score: z.string().min(1).optional() }),
  z.object({ kind: z.literal('stop') }),
  z.object({
    kind: z.literal('seek'),
    bar: z.number().int().min(0).optional(),
    section: z.string().min(1).optional(),
  }),
  z.object({ kind: z.literal('tempo'), scale: z.number().min(0.25).max(2) }),
  z.object({ kind: z.literal('transpose'), semitones: z.number().int().min(-24).max(24) }),
  z.object({ kind: z.literal('level'), level: z.enum(['beginner', 'intermediate', 'advanced']) }),
  z.object({ kind: z.literal('state') }),
  z.object({ kind: z.literal('practise'), drill: drillAskSchema }),
])

export type PassageAsk = z.infer<typeof passageSchema>
export type DrillAsk = z.infer<typeof drillAskSchema>
export type Command = z.infer<typeof commandSchema>

/** What the window answers: a sentence for the caller, and the same thing as data. */
export const linkResultSchema = z.object({
  ok: z.boolean(),
  text: z.string(),
  data: z.unknown().optional(),
})

export type LinkResult = z.infer<typeof linkResultSchema>

/**
 * What a request carries. The command is left unparsed here on purpose: the
 * protocol is checked first, so a command from a newer server is answered
 * with the version, not with a validation error about a kind it has never
 * heard of.
 */
export const envelopeSchema = z.object({
  protocol: z.number().int(),
  command: z.unknown(),
})

/**
 * The sentence either side gives when the other speaks another version.
 *
 * It names which one is behind, because "protocol mismatch" leaves somebody
 * updating the wrong thing.
 */
export function protocolMismatch(sides: {
  /** What this side is called, and the version it speaks. */
  readonly us: string
  readonly ours: number
  readonly them: string
  readonly theirs: number
}): string {
  const older = sides.theirs < sides.ours ? sides.them : sides.us
  return (
    `The ${sides.us} speaks version ${String(sides.ours)} of the piano link and the ` +
    `${sides.them} speaks version ${String(sides.theirs)}, so nothing was sent. ` +
    `Update the ${older}: it is the older of the two.`
  )
}
