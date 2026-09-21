import { describeScore, FORMAT_VERSION, isSupportedVersion, type Score } from '@piano/score-format'

export { createLibrary, libraryId, safeName, SCORE_SUFFIX } from './library'
export type { Files, Library, LibraryEntry, Saved } from './library'
export { createLink, NO_WINDOW, noWindow, windowsIn } from './link'
export type { Command, DrillAsk, Link, LinkDeps, LinkResult, PassageAsk } from './link'
export {
  createServer,
  defaultLibraryRoot,
  defaultPresenceDirectory,
  nodeFiles,
  nodeLink,
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
