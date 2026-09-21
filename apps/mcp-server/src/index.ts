import { describeScore, FORMAT_VERSION, isSupportedVersion, type Score } from '@piano/score-format'

export { createLibrary, libraryId, safeName, SCORE_SUFFIX } from './library'
export type { Files, Library, LibraryEntry, Saved } from './library'
export { noWindow } from './link'
export type { Command, DrillAsk, Link, LinkResult, PassageAsk } from './link'
export { createServer, defaultLibraryRoot, nodeFiles, start } from './server'
export { tool, toolsFor } from './tools'
export type { Tool, ToolResult } from './tools'

/**
 * The MCP server Claude Code talks to.
 *
 * The tool surface is here — validate a score, save one, play, seek, set the
 * level, practise a passage — and the handshake that finds the running app is
 * the task after this one: the transport tools go through a link, and the link
 * says plainly that no window is listening yet.
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
