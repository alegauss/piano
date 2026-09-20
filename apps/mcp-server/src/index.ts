import { describeScore, FORMAT_VERSION, isSupportedVersion, type Score } from '@piano/score-format'

/**
 * The MCP server Claude Code talks to.
 *
 * PI43 gives it its tool surface — validate a score, save one, play, seek, set
 * the level — and PI44 the handshake that finds the running app. What it does
 * today is hold up its end of the seam: it reads the score format from the
 * shared package, exactly as the desktop app does, so one change to that
 * package is checked against both consumers in a single typecheck.
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
