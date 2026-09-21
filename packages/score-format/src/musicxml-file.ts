/**
 * MusicXML at the level of text and bytes.
 *
 * An XML reader and the zip container a .mxl is, and nothing about what a
 * score is: musicxml.ts maps between the two. The same split midi-file.ts and
 * midi.ts have, and for the same reason — a reader tested only against its own
 * writer round-trips a shared misunderstanding perfectly, so this half is
 * tested against markup typed out by hand.
 *
 * The XML reader is written here rather than taken from a library because what
 * a score needs is elements, attributes, text and the five predefined
 * entities, and because this package runs in main, in the renderer and in the
 * MCP server with one dependency. What it deliberately does not do is
 * namespace resolution, validation, or DTD entity expansion, which reads a
 * second file: a document needing those is one this app refuses rather than
 * half-understands.
 *
 * Inflating a .mxl is the one thing not written here. DEFLATE is neither small
 * nor a decades-old constant the way the MIDI chunk format is, every host this
 * package runs in already has a tested implementation, and a subtly wrong one
 * corrupts a score in silence rather than refusing it. So the caller passes one
 * in, and plain XML — the common case, and the only one the renderer sees —
 * needs nothing.
 */

import { decodeBytes, decodeUtf16 } from './text'

/** Refused input, with a sentence saying what was wrong and where. */
export class MusicXmlError extends Error {
  override readonly name = 'MusicXmlError'
}

/**
 * One element. Text is the element's own, with its children's left out, which
 * is what every field in MusicXML wants: `<octave>4</octave>` is text, and
 * `<pitch>` is children.
 */
export type XmlElement = {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: readonly XmlElement[]
  readonly text: string
}

/**
 * Turn raw DEFLATE back into bytes, given what the directory says it expands
 * to. Node's `zlib.inflateRawSync` is one, and so is any of the several a
 * browser has; this package asks for one rather than holding its own.
 */
export type InflateRaw = (deflated: Uint8Array, expanded: number) => Uint8Array

const BYTE_ORDER_MARK = 0xfeff

/** The five XML predefines. Everything else numeric goes through the code point path. */
const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(text: string): string {
  if (!text.includes('&')) {
    return text
  }
  return text.replace(/&(#[Xx]?[0-9A-Fa-f]+|[A-Za-z][\w.-]*);/g, (whole: string, body: string) => {
    if (!body.startsWith('#')) {
      return ENTITIES[body] ?? whole
    }
    const hex = body.startsWith('#x') || body.startsWith('#X')
    const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
    // A lone surrogate is not a character, and String.fromCodePoint throws on one.
    if (
      !Number.isInteger(code) ||
      code < 0 ||
      code > 0x10ffff ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      return whole
    }
    return String.fromCodePoint(code)
  })
}

/**
 * The element name without its namespace prefix.
 *
 * MusicXML is not a namespaced vocabulary, but a file that has been through an
 * XSLT or a generic serialiser can come out with one, and a prefix nobody
 * declared would otherwise make every element name unrecognisable.
 */
function localName(name: string): string {
  const colon = name.lastIndexOf(':')
  return colon === -1 ? name : name.slice(colon + 1)
}

type Open = {
  readonly name: string
  readonly attributes: Record<string, string>
  readonly children: XmlElement[]
  text: string
}

const NAME_START = /[A-Za-z_:]/
const NAME_PART = /[\w.:-]/

class Reader {
  position = 0

  constructor(readonly source: string) {}

  get done(): boolean {
    return this.position >= this.source.length
  }

  /** Where the cursor is, counted the way an editor shows it. */
  where(): string {
    const before = this.source.slice(0, this.position)
    const line = before.split('\n').length
    const column = this.position - (before.lastIndexOf('\n') + 1) + 1
    return `line ${String(line)}, column ${String(column)}`
  }

  skipSpace(): void {
    while (!this.done && /\s/.test(this.source[this.position] ?? '')) {
      this.position += 1
    }
  }

  /** Read past `marker`, or refuse saying what was never closed. */
  through(marker: string, what: string): string {
    const end = this.source.indexOf(marker, this.position)
    if (end === -1) {
      throw new MusicXmlError(`${what} opened at ${this.where()} is never closed`)
    }
    const inside = this.source.slice(this.position, end)
    this.position = end + marker.length
    return inside
  }

  name(what: string): string {
    const start = this.position
    if (!NAME_START.test(this.source[this.position] ?? '')) {
      throw new MusicXmlError(`${what} at ${this.where()} has no name`)
    }
    this.position += 1
    while (!this.done && NAME_PART.test(this.source[this.position] ?? '')) {
      this.position += 1
    }
    return this.source.slice(start, this.position)
  }

  attributes(tag: string): Record<string, string> {
    const attributes: Record<string, string> = {}
    for (;;) {
      this.skipSpace()
      const next = this.source[this.position]
      if (next === undefined || next === '>' || next === '/' || next === '?') {
        return attributes
      }
      const name = this.name(`an attribute of <${tag}>`)
      this.skipSpace()
      if (this.source[this.position] !== '=') {
        throw new MusicXmlError(
          `the attribute "${name}" of <${tag}> at ${this.where()} has no value; XML has no bare attributes`,
        )
      }
      this.position += 1
      this.skipSpace()
      const quote = this.source[this.position]
      if (quote !== '"' && quote !== "'") {
        throw new MusicXmlError(
          `the attribute "${name}" of <${tag}> at ${this.where()} is not quoted`,
        )
      }
      this.position += 1
      attributes[localName(name)] = decodeEntities(
        this.through(quote, `the attribute "${name}" of <${tag}>`),
      )
    }
  }
}

/** A doctype, skipped whole: its internal subset may hold `>` inside brackets. */
function skipDoctype(reader: Reader): void {
  let depth = 0
  while (!reader.done) {
    const character = reader.source[reader.position]
    reader.position += 1
    if (character === '[') {
      depth += 1
    } else if (character === ']') {
      depth -= 1
    } else if (character === '>' && depth <= 0) {
      return
    }
  }
  throw new MusicXmlError('a <!DOCTYPE declaration is never closed')
}

/**
 * Read XML into elements.
 *
 * Throws MusicXmlError, with a sentence and a position, for anything that is
 * not well-formed. The document element is what comes back; a document with
 * none is refused rather than returned empty, since every caller here wants a
 * root to ask about.
 */
export function parseXml(text: string): XmlElement {
  const reader = new Reader(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text)
  const stack: Open[] = []
  let root: XmlElement | null = null

  const close = (open: Open): XmlElement => ({
    name: open.name,
    attributes: open.attributes,
    children: open.children,
    text: open.text.trim(),
  })

  while (!reader.done) {
    const next = reader.source.indexOf('<', reader.position)
    if (next === -1) {
      break
    }
    const top = stack[stack.length - 1]
    if (next > reader.position && top !== undefined) {
      top.text += decodeEntities(reader.source.slice(reader.position, next))
    }
    reader.position = next + 1

    if (reader.source.startsWith('!--', reader.position)) {
      reader.position += 3
      reader.through('-->', 'a comment')
      continue
    }
    if (reader.source.startsWith('![CDATA[', reader.position)) {
      reader.position += 8
      const raw = reader.through(']]>', 'a CDATA section')
      if (top !== undefined) {
        top.text += raw
      }
      continue
    }
    if (reader.source.startsWith('!', reader.position)) {
      reader.position += 1
      skipDoctype(reader)
      continue
    }
    if (reader.source.startsWith('?', reader.position)) {
      reader.position += 1
      reader.through('?>', 'a processing instruction')
      continue
    }

    if (reader.source.startsWith('/', reader.position)) {
      reader.position += 1
      const name = localName(reader.name('a closing tag'))
      reader.skipSpace()
      if (reader.source[reader.position] !== '>') {
        throw new MusicXmlError(`the closing tag </${name}> at ${reader.where()} is not closed`)
      }
      reader.position += 1
      const open = stack.pop()
      if (open === undefined) {
        throw new MusicXmlError(`</${name}> at ${reader.where()} closes an element nothing opened`)
      }
      if (open.name !== name) {
        throw new MusicXmlError(
          `<${open.name}> is closed by </${name}> at ${reader.where()}; tags have to nest`,
        )
      }
      const element = close(open)
      const parent = stack[stack.length - 1]
      if (parent === undefined) {
        root = element
      } else {
        parent.children.push(element)
      }
      continue
    }

    const name = localName(reader.name('a tag'))
    if (root !== null && stack.length === 0) {
      throw new MusicXmlError(
        `<${name}> at ${reader.where()} is a second root element; a document has one`,
      )
    }
    const attributes = reader.attributes(name)
    reader.skipSpace()
    const empty = reader.source.startsWith('/', reader.position)
    if (empty) {
      reader.position += 1
    }
    if (reader.source[reader.position] !== '>') {
      throw new MusicXmlError(`the tag <${name}> at ${reader.where()} is not closed`)
    }
    reader.position += 1

    const open: Open = { name, attributes, children: [], text: '' }
    if (!empty) {
      stack.push(open)
      continue
    }
    const element = close(open)
    const parent = stack[stack.length - 1]
    if (parent === undefined) {
      root = element
    } else {
      parent.children.push(element)
    }
  }

  const unclosed = stack[stack.length - 1]
  if (unclosed !== undefined) {
    throw new MusicXmlError(`<${unclosed.name}> is never closed`)
  }
  if (root === null) {
    throw new MusicXmlError('this is not XML: the document holds no element')
  }
  return root
}

/** The first child by name, or undefined. */
export function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((candidate) => candidate.name === name)
}

/** Every child by name, in document order. */
export function children(element: XmlElement | undefined, name: string): readonly XmlElement[] {
  return element?.children.filter((candidate) => candidate.name === name) ?? []
}

/** The text of a named child, or undefined where there is none or it is empty. */
export function childText(element: XmlElement | undefined, name: string): string | undefined {
  const text = child(element, name)?.text
  return text === undefined || text === '' ? undefined : text
}

/** The text of a named child as a number, or undefined where it is not one. */
export function childNumber(element: XmlElement | undefined, name: string): number | undefined {
  const text = childText(element, name)
  if (text === undefined) {
    return undefined
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** An attribute as a number, or undefined where it is absent or not one. */
export function attributeNumber(element: XmlElement | undefined, name: string): number | undefined {
  const text = element?.attributes[name]
  if (text === undefined) {
    return undefined
  }
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

// ---------------------------------------------------------------------------
// The .mxl container
// ---------------------------------------------------------------------------

const LOCAL_HEADER = 0x04034b50
const CENTRAL_ENTRY = 0x02014b50
const END_OF_DIRECTORY = 0x06054b50

/** Stored and deflated: the two methods anything writing a .mxl uses. */
const STORED = 0
const DEFLATED = 8

/** A zip may carry a trailing comment, and the end record is what follows it. */
const MAX_COMMENT = 0xffff

/** A size field of all ones means the real one is in a zip64 record. */
const NEEDS_ZIP64 = 0xffffffff

function uint(bytes: Uint8Array, offset: number, width: number): number {
  let value = 0
  for (let index = width - 1; index >= 0; index -= 1) {
    value = value * 256 + (bytes[offset + index] ?? 0)
  }
  return value
}

type ZipEntry = {
  readonly name: string
  readonly method: number
  readonly offset: number
  readonly compressedSize: number
  readonly size: number
}

/** Whether these bytes open a zip, which is what a compressed MusicXML file is. */
export function isCompressedMusicXml(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && uint(bytes, 0, 4) === LOCAL_HEADER
}

/**
 * The entries a zip's central directory lists.
 *
 * The directory rather than the local headers, because a writer streaming its
 * output leaves the sizes in the local header zero and puts the real ones only
 * here — which is exactly what several MusicXML exporters do.
 */
function readDirectory(bytes: Uint8Array): ZipEntry[] {
  const earliest = Math.max(0, bytes.length - MAX_COMMENT - 22)
  let end = -1
  for (let position = bytes.length - 22; position >= earliest; position -= 1) {
    if (uint(bytes, position, 4) === END_OF_DIRECTORY) {
      end = position
      break
    }
  }
  if (end === -1) {
    throw new MusicXmlError('this file opens like a zip but has no directory at the end of it')
  }

  const count = uint(bytes, end + 10, 2)
  let position = uint(bytes, end + 16, 4)
  const entries: ZipEntry[] = []

  for (let index = 0; index < count; index += 1) {
    if (position + 46 > bytes.length || uint(bytes, position, 4) !== CENTRAL_ENTRY) {
      throw new MusicXmlError(
        `the zip directory breaks off after ${String(entries.length)} of ${String(count)} entries`,
      )
    }
    const nameLength = uint(bytes, position + 28, 2)
    const extraLength = uint(bytes, position + 30, 2)
    const commentLength = uint(bytes, position + 32, 2)
    const compressedSize = uint(bytes, position + 20, 4)
    const size = uint(bytes, position + 24, 4)
    if (compressedSize === NEEDS_ZIP64 || size === NEEDS_ZIP64) {
      throw new MusicXmlError('this is a zip64 archive, which is far larger than any score')
    }
    entries.push({
      name: decodeBytes(bytes.subarray(position + 46, position + 46 + nameLength)),
      method: uint(bytes, position + 10, 2),
      offset: uint(bytes, position + 42, 4),
      compressedSize,
      size,
    })
    position += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** One entry's bytes, inflated where it is deflated. */
function readEntry(
  bytes: Uint8Array,
  entry: ZipEntry,
  inflateRaw: InflateRaw | undefined,
): Uint8Array {
  if (entry.offset + 30 > bytes.length || uint(bytes, entry.offset, 4) !== LOCAL_HEADER) {
    throw new MusicXmlError(`the zip directory points at no file where "${entry.name}" should be`)
  }
  const start =
    entry.offset + 30 + uint(bytes, entry.offset + 26, 2) + uint(bytes, entry.offset + 28, 2)
  const end = start + entry.compressedSize
  if (end > bytes.length) {
    throw new MusicXmlError(`"${entry.name}" runs past the end of the file`)
  }
  const stored = bytes.subarray(start, end)

  if (entry.method === STORED) {
    return stored
  }
  if (entry.method !== DEFLATED) {
    throw new MusicXmlError(
      `"${entry.name}" is packed by method ${String(entry.method)}; this reads stored and deflated`,
    )
  }
  if (inflateRaw === undefined) {
    throw new MusicXmlError(
      'this is a compressed MusicXML file and nothing here was given a way to unpack one',
    )
  }
  return inflateRaw(stored, entry.size)
}

/** Text from bytes, honouring a byte order mark and defaulting to UTF-8 as XML does. */
function decodeXml(bytes: Uint8Array): string {
  const [first, second] = bytes
  if (first === 0xff && second === 0xfe) {
    return decodeUtf16(bytes.subarray(2), true)
  }
  if (first === 0xfe && second === 0xff) {
    return decodeUtf16(bytes.subarray(2), false)
  }
  return decodeBytes(bytes)
}

/**
 * Which file inside a .mxl is the score.
 *
 * META-INF/container.xml names it, and that is the answer wherever one is
 * readable. The fallback is the first XML file outside META-INF, which is what
 * the layout has been in practice since before the container was specified.
 */
function rootFileName(
  bytes: Uint8Array,
  entries: readonly ZipEntry[],
  inflateRaw?: InflateRaw,
): string {
  const container = entries.find((entry) => entry.name === 'META-INF/container.xml')
  if (container !== undefined) {
    try {
      const named = children(
        child(parseXml(decodeXml(readEntry(bytes, container, inflateRaw))), 'rootfiles'),
        'rootfile',
      )
        .map((rootfile) => rootfile.attributes['full-path'])
        .find((path) => path !== undefined && path !== '')
      if (named !== undefined) {
        return named
      }
    } catch {
      // A container nobody can read is no worse than one that was never there.
    }
  }

  const guessed = entries.find(
    (entry) =>
      !entry.name.startsWith('META-INF/') &&
      !entry.name.endsWith('/') &&
      /\.(?:musicxml|xml)$/i.test(entry.name),
  )
  if (guessed === undefined) {
    throw new MusicXmlError('this compressed file holds no MusicXML document')
  }
  return guessed.name
}

/**
 * The XML a MusicXML file holds, whichever of its two shapes it arrived in.
 *
 * Plain markup comes back decoded; a .mxl is opened, its container read and
 * the score inside it returned. `inflateRaw` is needed for the second only,
 * and a compressed file handed over without one is refused by name rather than
 * read wrongly.
 */
export function musicXmlText(bytes: Uint8Array, inflateRaw?: InflateRaw): string {
  if (!isCompressedMusicXml(bytes)) {
    return decodeXml(bytes)
  }
  const entries = readDirectory(bytes)
  const wanted = rootFileName(bytes, entries, inflateRaw)
  const entry = entries.find((candidate) => candidate.name === wanted)
  if (entry === undefined) {
    throw new MusicXmlError(`the container names "${wanted}", which the file does not hold`)
  }
  return decodeXml(readEntry(bytes, entry, inflateRaw))
}
