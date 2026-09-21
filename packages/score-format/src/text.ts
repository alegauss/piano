/**
 * Bytes as text, without asking the platform.
 *
 * TextDecoder would do all of this, and this package may not have it: it runs
 * in the main process, in the renderer and in the MCP server, and its tsconfig
 * names neither the DOM nor node on purpose, so that a dependency on one of
 * them is a compile error rather than a crash in whichever host was not tested.
 *
 * Both formats that arrive as bytes need this. A MIDI file's meta events are
 * short strings of unstated encoding; a MusicXML document is a whole file that
 * states its own. What they share is UTF-8 and the need to do something
 * sensible with bytes that are not.
 */

/** Long enough to keep the call count down, short enough never to exhaust the stack. */
const CHUNK = 0x800

/** The smallest code point each sequence length is allowed to carry. */
const SHORTEST: readonly number[] = [0, 0x80, 0x800, 0x10000]

function fromUnits(units: readonly number[]): string {
  return String.fromCharCode(...units)
}

/**
 * UTF-8, or null where the bytes are not.
 *
 * Null rather than a string full of replacement characters, so a caller with a
 * better guess than "this was mojibake" gets to make it.
 */
export function decodeUtf8(bytes: Uint8Array): string | null {
  let out = ''
  let units: number[] = []
  let index = 0

  while (index < bytes.length) {
    const lead = bytes[index] ?? 0
    let extra: number
    if (lead < 0x80) {
      extra = 0
    } else if ((lead & 0xe0) === 0xc0) {
      extra = 1
    } else if ((lead & 0xf0) === 0xe0) {
      extra = 2
    } else if ((lead & 0xf8) === 0xf0) {
      extra = 3
    } else {
      return null
    }

    // The lead byte's payload is what is left once its length has been said.
    let code = extra === 0 ? lead : lead & (0x3f >> extra)
    for (let step = 1; step <= extra; step += 1) {
      const next = bytes[index + step]
      if (next === undefined || (next & 0xc0) !== 0x80) {
        return null
      }
      code = code * 64 + (next & 0x3f)
    }
    index += extra + 1

    // A code point written in more bytes than it needs, or one that names half
    // a surrogate pair, is how a decoder gets talked into accepting smuggled
    // bytes. Neither is text.
    if (code < (SHORTEST[extra] ?? 0) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      return null
    }
    if (code > 0xffff) {
      const rest = code - 0x10000
      units.push(0xd800 + (rest >> 10), 0xdc00 + (rest & 0x3ff))
    } else {
      units.push(code)
    }

    if (units.length >= CHUNK) {
      out += fromUnits(units)
      units = []
    }
  }

  return out + fromUnits(units)
}

/** One byte per character, which is what an old file that is not UTF-8 turns out to be. */
export function decodeLatin1(bytes: Uint8Array): string {
  let out = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    out += fromUnits([...bytes.subarray(index, index + CHUNK)])
  }
  return out
}

/** UTF-16 in either order, which is the encoding a byte order mark announces. */
export function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  let out = ''
  let units: number[] = []

  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1] ?? 0
    units.push(littleEndian ? second * 256 + first : first * 256 + second)
    if (units.length >= CHUNK) {
      out += fromUnits(units)
      units = []
    }
  }

  return out + fromUnits(units)
}

/**
 * Text from bytes whose encoding nobody stated.
 *
 * UTF-8 where it is, and one byte per character where it is not: bytes that
 * happen to be valid UTF-8 and were meant as Latin-1 are rare, and the
 * replacement character is the one answer that is wrong either way.
 */
export function decodeBytes(bytes: Uint8Array): string {
  return decodeUtf8(bytes) ?? decodeLatin1(bytes)
}
