/**
 * Reading a sample library's own map of itself.
 *
 * Salamander ships as SFZ: text that says which recording plays which keys at
 * which velocities. The pack is planned from that map rather than from file
 * names, because the map is what the library's author says and a naming
 * convention is only what they happened to do.
 */

/** One region: a recording and the keys it plays. */
export type SfzRegion = {
  /** The recording's name, with the library's $VEL and $EXT placeholders left in. */
  readonly sample: string
  readonly pitch: number
  readonly lowKey: number
  readonly highKey: number
  /** The tuning placeholder the region names, such as $TUNE01. */
  readonly tune?: string
  /** A region with its own long release is a string with no damper. */
  readonly undamped: boolean
}

/** One velocity layer: a set of recordings struck at one strength, and the velocities it answers. */
export type VelocityLayer = {
  readonly layer: number
  readonly lowVelocity: number
  readonly highVelocity: number
}

function opcodes(line: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const token of line.split(/\s+/)) {
    const equals = token.indexOf('=')
    if (equals > 0) {
      found.set(token.slice(0, equals), token.slice(equals + 1))
    }
  }
  return found
}

function integer(value: string | undefined, what: string, line: string): number {
  const parsed = Number(value)
  if (value === undefined || !Number.isInteger(parsed)) {
    throw new Error(`an SFZ region has no whole ${what}: ${line.trim()}`)
  }
  return parsed
}

/** Every <region> line in a region file. */
export function parseRegions(text: string): SfzRegion[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trimStart().startsWith('<region>'))
    .map((line) => {
      const found = opcodes(line)
      const sample = found.get('sample')
      if (sample === undefined) {
        throw new Error(`an SFZ region names no sample: ${line.trim()}`)
      }
      const tune = found.get('tune')
      return {
        sample,
        pitch: integer(found.get('pitch_keycenter'), 'pitch_keycenter', line),
        lowKey: integer(found.get('lokey'), 'lokey', line),
        highKey: integer(found.get('hikey'), 'hikey', line),
        ...(tune !== undefined ? { tune } : {}),
        undamped: found.has('ampeg_release'),
      }
    })
}

/** The velocity layers a notes file declares, one group per layer. */
export function parseVelocityLayers(text: string): VelocityLayer[] {
  const layers: VelocityLayer[] = []
  for (const match of text.matchAll(/vel_(\d+)\.txt"\s+lovel=(\d+)\s+hivel=(\d+)/g)) {
    layers.push({
      layer: Number(match[1]),
      lowVelocity: Number(match[2]),
      highVelocity: Number(match[3]),
    })
  }
  return layers.sort((a, b) => a.lowVelocity - b.lowVelocity)
}

/** `#define $NAME value` lines, as numbers by name. */
export function parseDefines(text: string): Map<string, number> {
  const defines = new Map<string, number>()
  for (const match of text.matchAll(/#define\s+(\$\w+)\s+(-?[\d.]+)/g)) {
    const [, name, value] = match
    if (name !== undefined && value !== undefined) {
      defines.set(name, Number(value))
    }
  }
  return defines
}
