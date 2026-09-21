/**
 * Channel names, and nothing else.
 *
 * This module has no dependencies on purpose. The preload is the one
 * privileged piece of code the renderer can reach, so it carries the minimum
 * that will do the job: the names it forwards on, and types, which vanish at
 * build time. Validation lives in main, which is where the payload is not yet
 * trusted, and pulling the schema library across the bridge would put a whole
 * dependency inside the boundary for no gain.
 */

export const CHANNEL_NAMES = {
  appInfo: 'app:info',
  windowSetTitle: 'window:set-title',
  packManifest: 'pack:manifest',
  packFile: 'pack:file',
  linkAnswer: 'link:answer',
  linkListening: 'link:listening',
} as const

export type ChannelName = (typeof CHANNEL_NAMES)[keyof typeof CHANNEL_NAMES]

/**
 * Messages main sends the renderer without being asked.
 *
 * Apart from the channels because they run the other way: a channel is the
 * renderer asking and main answering, and a push is main telling. There is
 * one, and it carries a command from Claude Code to the window.
 */
export const PUSH_NAMES = {
  linkCommand: 'link:command',
} as const
