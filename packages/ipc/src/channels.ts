import { z } from 'zod'

import { linkResultSchema, type Command } from './link'
import { CHANNEL_NAMES } from './names'
import { settingsPatchSchema, settingsSchema } from './settings'

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
    /** The release, which is the number the link names when it asks for an update. */
    app: z.string(),
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

const LEVEL = z.enum(['beginner', 'intermediate', 'advanced'])

/** What somebody is looking for in the library, and which way round to list it. */
export const libraryQuerySchema = z.object({
  /** Words from the title or the composer. */
  text: z.string().max(200).optional(),
  level: LEVEL.optional(),
  composer: z.string().max(200).optional(),
  /** All of them, not any: a tag added to a search narrows it. */
  tags: z.array(z.string().max(100)).max(20).optional(),
  order: z.enum(['easiest', 'newest']).optional(),
})

/** One score as a list shows it: what it is, how hard, how long, and when it arrived. */
export const libraryItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  composer: z.string().optional(),
  level: LEVEL.optional(),
  difficulty: z.number().optional(),
  tags: z.array(z.string()),
  seconds: z.number(),
  /** When it first appeared in the library, in epoch milliseconds. */
  added: z.number(),
})

/**
 * The library, searched. Answered from the same index the MCP server's list
 * and search tools read, so the window and a chat never disagree about what
 * is there.
 */
export const libraryList = {
  channel: CHANNEL_NAMES.libraryList,
  request: libraryQuerySchema,
  response: z.array(libraryItemSchema),
} as const satisfies Channel<'library:list', z.ZodType, z.ZodType>

/**
 * The settings as main holds them, with word of anything that had to go back
 * to its default, and whether there was a file at all — the one moment the
 * window imports what an older version kept in the browser's storage.
 */
export const settingsRead = {
  channel: CHANNEL_NAMES.settingsRead,
  request: z.null(),
  response: z.object({
    settings: settingsSchema,
    notice: z.string().nullable(),
    fresh: z.boolean(),
  }),
} as const satisfies Channel<'settings:read', z.ZodType, z.ZodType>

/** Change some settings; what comes back is all of them, as now kept. */
export const settingsWrite = {
  channel: CHANNEL_NAMES.settingsWrite,
  request: settingsPatchSchema,
  response: settingsSchema,
} as const satisfies Channel<'settings:write', z.ZodType, z.ZodType>

/** Every setting back to its default: the quickest way out of a setup that went wrong. */
export const settingsReset = {
  channel: CHANNEL_NAMES.settingsReset,
  request: z.null(),
  response: settingsSchema,
} as const satisfies Channel<'settings:reset', z.ZodType, z.ZodType>

/**
 * The sample pack that could be downloaded, and how big it is, asked before
 * anything is fetched: a download is honest about its size before it starts.
 */
export const packSource = {
  channel: CHANNEL_NAMES.packSource,
  request: z.null(),
  response: z.discriminatedUnion('available', [
    z.object({ available: z.literal(false), reason: z.string() }),
    z.object({
      available: z.literal(true),
      id: z.string(),
      version: z.number(),
      bytes: z.number().nonnegative(),
      files: z.number().int().nonnegative(),
    }),
  ]),
} as const satisfies Channel<'pack:source', z.ZodType, z.ZodType>

/**
 * Fetch the sample pack, continuing whatever an earlier attempt left, and put
 * it in place once every file is verified. Answers when it is done; how far it
 * has got arrives meanwhile as a push.
 */
export const packDownload = {
  channel: CHANNEL_NAMES.packDownload,
  request: z.null(),
  response: z.object({ installed: z.boolean(), reason: z.string() }),
} as const satisfies Channel<'pack:download', z.ZodType, z.ZodType>

/** Stop the download, keeping what has arrived for the next attempt. */
export const packCancel = {
  channel: CHANNEL_NAMES.packCancel,
  request: z.null(),
  response: z.null(),
} as const satisfies Channel<'pack:cancel', z.ZodType, z.ZodType>

/**
 * Save the score the window is showing as a MIDI file. The score crosses, not
 * a path: what is in memory, at the level chosen, is the thing being saved,
 * and main asks the person where. Main validates it again, since it comes
 * from the renderer.
 */
export const scoreExport = {
  channel: CHANNEL_NAMES.scoreExport,
  request: z.object({
    score: z.unknown(),
    /** The level the notes are an arrangement for, named in the file; null for as written. */
    level: LEVEL.nullable(),
  }),
  response: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('saved'),
      /** The file's name, as a person would recognise it. */
      name: z.string(),
      /** What the file has nowhere to put, one sentence each. */
      dropped: z.array(z.string()),
    }),
    z.object({ kind: z.literal('cancelled') }),
    z.object({ kind: z.literal('refused'), message: z.string() }),
  ]),
} as const satisfies Channel<'score:export', z.ZodType, z.ZodType>

/**
 * Keep an arrangement the rules worked out in the open score's own file, where
 * it can be read and corrected, and answer with the score as now kept. Only
 * into the file the window has open, which main knows and the page does not
 * name; main validates the arrangement and the score it makes.
 */
export const scoreKeepArrangement = {
  channel: CHANNEL_NAMES.scoreKeepArrangement,
  // Strict, so a request that tries to say where to write is refused rather
  // than quietly trimmed: the page has no say in which file.
  request: z.object({ arrangement: z.record(z.string(), z.unknown()) }).strict(),
  response: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('kept'), name: z.string(), score: z.unknown() }),
    z.object({ kind: z.literal('refused'), message: z.string() }),
  ]),
} as const satisfies Channel<'score:keep-arrangement', z.ZodType, z.ZodType>

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
  libraryList,
  settingsRead,
  settingsWrite,
  settingsReset,
  packSource,
  packDownload,
  packCancel,
  scoreExport,
  scoreKeepArrangement,
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
export type LibraryQuery = z.infer<typeof libraryQuerySchema>
export type LibraryItem = z.infer<typeof libraryItemSchema>
export type SettingsReadResponse = z.infer<typeof settingsRead.response>
export type PackSourceResponse = z.infer<typeof packSource.response>
export type PackDownloadResponse = z.infer<typeof packDownload.response>
export type ExportRequest = z.infer<typeof scoreExport.request>
export type ExportResult = z.infer<typeof scoreExport.response>
export type KeepRequest = z.infer<typeof scoreKeepArrangement.request>
export type KeepResult = z.infer<typeof scoreKeepArrangement.response>

/** How far the sample pack's download has got, pushed as it goes. */
export type PackProgressPush = {
  readonly phase: 'downloading' | 'installing'
  readonly bytes: number
  readonly total: number
}

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
