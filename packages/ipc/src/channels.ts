import { z } from 'zod'

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

/** Every channel, so main can assert it registered all of them and a check can walk them. */
export const allChannels = [appInfo, windowSetTitle] as const

export type AppInfoRequest = z.infer<typeof appInfo.request>
export type AppInfoResponse = z.infer<typeof appInfo.response>
export type WindowSetTitleRequest = z.infer<typeof windowSetTitle.request>
export type WindowSetTitleResponse = z.infer<typeof windowSetTitle.response>

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
