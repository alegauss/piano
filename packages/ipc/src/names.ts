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
} as const

export type ChannelName = (typeof CHANNEL_NAMES)[keyof typeof CHANNEL_NAMES]
