import { describeScore, FORMAT_VERSION, isSupportedVersion, type Score } from '@piano/score-format'

export { safeName, SCORE_SUFFIX } from '@piano/ipc'
export { createLibrary, libraryId, nodeFiles } from '@piano/library'
export type { Files, Library, LibraryEntry, Order, Saved } from '@piano/library'
export { candidates, findApp, isPianoApp, whereLooked } from './launch'
export type { Candidate, Found, Place } from './launch'
export {
  APP_RELEASES,
  createLink,
  LAUNCH_TIMEOUT_MS,
  NO_WINDOW,
  noWindow,
  notInstalled,
  windowsIn,
} from './link'
export type { Launched } from './link'
export { PLUGIN_VERSION } from './version'
export type { Command, DrillAsk, Link, LinkDeps, LinkResult, PassageAsk } from './link'
export {
  createServer,
  defaultLibraryRoot,
  defaultPresenceDirectory,
  nodeLaunch,
  nodeLink,
  nodePlace,
  processAlive,
  start,
} from './server'
export { tool, toolsFor } from './tools'
export type { Tool, ToolResult } from './tools'

/**
 * The MCP server Claude Code talks to.
 *
 * The tool surface is here — validate a score, save one, play, seek, set the
 * level, practise a passage — and so is the link that finds the window the
 * person is looking at and speaks to it, saying plainly when none is open.
 *
 * Everything it knows about the score format it reads from the shared package,
 * exactly as the desktop app does, so a file the app would refuse is never one
 * this server writes.
 */
export function serverBanner(): string {
  return `piano mcp server, score format v${String(FORMAT_VERSION)}`
}

/**
 * What a tool result says about a score it was handed. The prose is the shared
 * package's, never this server's: a score named one way here and another way in
 * the app is the drift this package exists to prevent.
 */
export function describeForTool(score: Score): string {
  if (!isSupportedVersion(score)) {
    return `unsupported score format v${String(score.formatVersion)}`
  }
  return describeScore(score)
}
