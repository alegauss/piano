// The shape scripts/product.mjs writes into product.generated.ts.

export interface ToolFact {
  /** the name the MCP server registers, e.g. save_score */
  name: string
  title: string
  /** the first sentence of the tool's own description */
  summary: string
}

export interface CommandFact {
  /** as typed in Claude Code, e.g. /piano:compose */
  name: string
  hint: string
  description: string
}

export interface LevelFact {
  level: string
  label: string
  means: string
}

export interface ProductData {
  name: string
  repo: string
  version: string
  license: string
  /** the lowest Node the repository runs on, as engines.node spells it: "20.11" */
  node: string
  formatVersion: number
  /** the newest v* tag, or null while nothing has been released */
  release: string | null
  marketplace: string
  plugin: string
  tools: ToolFact[]
  commands: CommandFact[]
  levels: LevelFact[]
  bundled: { title: string; composer: string | null }[]
  /** the head of a bundled score, cut to its first notes; `notes` is how many the whole has */
  excerpt: { from: string; notes: number; json: string }
}
