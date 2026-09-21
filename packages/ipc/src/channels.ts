import { z } from 'zod'

import { linkResultSchema, type Command } from './link'
import { CHANNEL_NAMES } from './names'

/**
 * Every channel between the renderer and main, declared once.
 *
 * A channel is named by intent rather than by capability: `window:set-title`,
 * not `invokeMainMethod`. The difference matters because the preload is the
 * trust boundary, and a bridge that exposes a capability lets the next screen
 * reach anything, while one that exposes an intent has to be widened on
 * purpose, in a diff a reviewer sees.
 *
 * Each channel carries a schema for its request and one for its response. The
 * request schema is what main validates on arrival: the renderer is the least
 * trusted process in this app, and "the renderer sent it" is not a reason to
 * believe a payload.
 */

export type Channel<Name extends string, Request extends z.ZodType, Response extends z.ZodType> = {
  readonly channel: Name
  readonly request: Request
  readonly response: Response
}

/** Versions worth showing, and the score format the app was built against. */
export const appInfo = {
  channel: CHANNEL_NAMES.appInfo,
  request: z.null(),
  response: z.object({
    electron: z.string(),
    chrome: z.string(),
    node: z.string(),
    scoreFormatVersion: z.number().int().nonnegative(),
  }),
} as const satisfies Channel<'app:info', z.ZodType, z.ZodType>

/**
 * The window title belongs to main: the renderer cannot set it, and once a
 * score is open its name goes here.
 */
export const windowSetTitle = {
  channel: CHANNEL_NAMES.windowSetTitle,
  request: z.object({
    title: z.string().min(1).max(200),
  }),
  response: z.object({
    title: z.string(),
  }),
} as const satisfies Channel<'window:set-title', z.ZodType, z.ZodType>

/**
 * The installed sample pack's manifest, or where main looked and found none.
 *
 * The manifest crosses as JSON not yet trusted: the renderer checks it with
 * the pack's own schema before it decodes anything, because a pack is a
 * download and not part of this app.
 */
export const packManifest = {
  channel: CHANNEL_NAMES.packManifest,
  request: z.null(),
  response: z.discriminatedUnion('installed', [
    z.object({ installed: z.literal(false), location: z.string() }),
    z.object({ installed: z.literal(true), manifest: z.unknown() }),
  ]),
} as const satisfies Channel<'pack:manifest', z.ZodType, z.ZodType>

/**
 * One recording from the installed pack.
 *
 * Named by the path the manifest gives it, and refused unless it is one:
 * main serves only files the manifest lists, from inside the pack, so this
 * channel cannot become a way to read the disk.
 */
export const packFile = {
  channel: CHANNEL_NAMES.packFile,
  request: z.object({
    path: z
      .string()
      .regex(
        /^(?:samples|releases)\/[A-Za-z0-9_-]+\.(?:ogg|wav)$/,
        'a recording the manifest names, such as samples/C4-v8.ogg or releases/60.ogg',
      ),
  }),
  response: z.object({
    bytes: z.instanceof(Uint8Array),
  }),
} as const satisfies Channel<'pack:file', z.ZodType, z.ZodType>

/**
 * The window's answer to a command main pushed it, matched by the id it came
 * with. The result is checked here like any other request: it is the renderer
 * talking, and main passes it straight on to the MCP server.
 */
export const linkAnswer = {
  channel: CHANNEL_NAMES.linkAnswer,
  request: z.object({
    id: z.string().min(1),
    result: linkResultSchema,
  }),
  response: z.null(),
} as const satisfies Channel<'link:answer', z.ZodType, z.ZodType>

/**
 * The window saying it is ready for commands from Claude Code.
 *
 * The app only tells the MCP server it is there once this arrives: an app
 * started by a tool call is announced when the window can act on what it is
 * sent, not when the process began, or the first command after a cold start
 * would be pushed to a window that is not listening yet and lost.
 */
export const linkListening = {
  channel: CHANNEL_NAMES.linkListening,
  request: z.null(),
  response: z.null(),
} as const satisfies Channel<'link:listening', z.ZodType, z.ZodType>

/** Long enough for any path a file system will hand over, and no longer. */
const PATH = z.string().min(1).max(4096)

/**
 * Where a score to open comes from. Never a path the page made up: a dropped
 * file's path is worked out by the preload from the file itself, a recent one
 * must be on the list main keeps, and a library score is named by its id.
 */
export const openRequestSchema = z.discriminatedUnion('from', [
  /** Ask the person, with the system's own file dialog. */
  z.object({ from: z.literal('dialog') }),
  /** A file somebody dropped on the window. */
  z.object({ from: z.literal('dropped'), path: PATH }),
  /** One of the scores opened before, by the path the recent list holds. */
  z.object({ from: z.literal('recent'), path: PATH }),
  /** A score in the library, by the id Claude Code saved it under. */
  z.object({ from: z.literal('library'), id: z.string().min(1).max(200) }),
  /** Whatever the app was started to open, asked for once the window can show it. */
  z.object({ from: z.literal('launch') }),
])

/** One thing wrong with a file, in the halves a person acts on and the path a model does. */
export const openProblemSchema = z.object({
  kind: z.string(),
  path: z.string(),
  received: z.string(),
  expected: z.string(),
  fix: z.string().optional(),
})

/**
 * What became of an open. A refused file names what is wrong with it and
 * nothing else changes; opened, the score has already been validated by main,
 * which is the one place every route goes through.
 */
export const openResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('opened'),
    /** The file's name, as a person would recognise it. */
    name: z.string(),
    score: z.unknown(),
    /** What opening it changed or guessed, one sentence each: a migration, a MIDI import. */
    notices: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('refused'),
    name: z.string(),
    message: z.string(),
    problems: z.array(openProblemSchema),
  }),
  /** Nothing to open: the dialog was closed, or the app was started with no file. */
  z.object({ kind: z.literal('none') }),
])

/** Open a score from one of the places a score comes from, through one validation. */
export const scoreOpen = {
  channel: CHANNEL_NAMES.scoreOpen,
  request: openRequestSchema,
  response: openResultSchema,
} as const satisfies Channel<'score:open', z.ZodType, z.ZodType>

export const recentEntrySchema = z.object({
  path: PATH,
  /** The file's name, which is how two scores with one title are told apart. */
  name: z.string(),
  title: z.string(),
})

/** The scores opened lately, newest first. */
export const scoreRecent = {
  channel: CHANNEL_NAMES.scoreRecent,
  request: z.null(),
  response: z.array(recentEntrySchema),
} as const satisfies Channel<'score:recent', z.ZodType, z.ZodType>

/** Every channel, so main can assert it registered all of them and a check can walk them. */
export const allChannels = [
  appInfo,
  windowSetTitle,
  packManifest,
  packFile,
  linkAnswer,
  linkListening,
  scoreOpen,
  scoreRecent,
] as const

export type AppInfoRequest = z.infer<typeof appInfo.request>
export type AppInfoResponse = z.infer<typeof appInfo.response>
export type WindowSetTitleRequest = z.infer<typeof windowSetTitle.request>
export type WindowSetTitleResponse = z.infer<typeof windowSetTitle.response>
export type PackManifestResponse = z.infer<typeof packManifest.response>
export type PackFileRequest = z.infer<typeof packFile.request>
export type PackFileResponse = z.infer<typeof packFile.response>
export type LinkAnswerRequest = z.infer<typeof linkAnswer.request>
export type OpenRequest = z.infer<typeof openRequestSchema>
export type OpenProblem = z.infer<typeof openProblemSchema>
export type OpenResult = z.infer<typeof openResultSchema>
export type RecentEntry = z.infer<typeof recentEntrySchema>

/** What main pushes the window: a command, and the id its answer must carry. */
export type LinkCommandPush = {
  readonly id: string
  readonly command: Command
}

/**
 * A validation failure, in words the next reader can act on.
 *
 * The next reader is usually not a person: it is the renderer reporting why a
 * call failed, and later a model repairing a score it just wrote. "Invalid
 * input" tells either of them nothing, so the path and the reason both travel.
 */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}
