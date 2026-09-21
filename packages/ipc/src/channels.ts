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

/** Every channel, so main can assert it registered all of them and a check can walk them. */
export const allChannels = [
  appInfo,
  windowSetTitle,
  packManifest,
  packFile,
  linkAnswer,
  linkListening,
] as const

export type AppInfoRequest = z.infer<typeof appInfo.request>
export type AppInfoResponse = z.infer<typeof appInfo.response>
export type WindowSetTitleRequest = z.infer<typeof windowSetTitle.request>
export type WindowSetTitleResponse = z.infer<typeof windowSetTitle.response>
export type PackManifestResponse = z.infer<typeof packManifest.response>
export type PackFileRequest = z.infer<typeof packFile.request>
export type PackFileResponse = z.infer<typeof packFile.response>
export type LinkAnswerRequest = z.infer<typeof linkAnswer.request>

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
