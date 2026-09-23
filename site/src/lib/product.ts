import { product } from './product.generated'
import type { ToolFact } from './product-types'

export { product }

/**
 * A tool, by the name the server registers it under.
 *
 * The copy names tools in its prose and in the hero session, and each of those names goes
 * through here, so a tool renamed or removed in apps/mcp-server fails the build at import time
 * rather than leaving the page describing a call that no longer exists.
 */
export function tool(name: string): ToolFact {
  const found = product.tools.find((t) => t.name === name)
  if (!found) {
    throw new Error(`product: the MCP server registers no tool called "${name}"`)
  }
  return found
}

/** The same check, for a slash command the copy names. */
export function command(name: string): string {
  const found = product.commands.find((c) => c.name === name)
  if (!found) {
    throw new Error(`product: the plugin brings no command called "${name}"`)
  }
  return found.name
}

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
]

/** A count as prose writes it: words up to twenty, figures after. */
export function spelled(n: number): string {
  return WORDS[n] ?? String(n)
}

/** The same, at the start of a sentence. */
export function Spelled(n: number): string {
  const s = spelled(n)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** A list as prose: "a", "a and b", "a, b and c". */
export function listed(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export const repoUrl = `https://github.com/${product.repo}`
export const releasesUrl = `${repoUrl}/releases/latest`
