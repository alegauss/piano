import { describe, expect, it } from 'vitest'

import {
  attributeNumber,
  child,
  childNumber,
  childText,
  children,
  isCompressedMusicXml,
  musicXmlText,
  MusicXmlError,
  parseXml,
  type InflateRaw,
} from './musicxml-file'

/**
 * The reader is tested against markup and bytes written out here rather than
 * against anything this package produced, because there is no writer: a zip
 * built by the test is the only way to know the directory walk agrees with
 * what a real exporter emits.
 */

function bytes(text: string): Uint8Array {
  const out: number[] = []
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return Uint8Array.from(out)
}

function push(out: number[], value: number, width: number): void {
  for (let index = 0; index < width; index += 1) {
    out.push((value >> (index * 8)) & 0xff)
  }
}

/** A zip holding the named files, stored rather than deflated unless told otherwise. */
function zip(files: readonly { name: string; body: Uint8Array; method?: number }[]): Uint8Array {
  const out: number[] = []
  const directory: number[] = []

  for (const file of files) {
    const name = bytes(file.name)
    const offset = out.length
    const method = file.method ?? 0
    push(out, 0x04034b50, 4)
    push(out, 20, 2)
    push(out, 0, 2)
    push(out, method, 2)
    push(out, 0, 4)
    push(out, 0, 4)
    push(out, file.body.length, 4)
    push(out, file.body.length, 4)
    push(out, name.length, 2)
    push(out, 0, 2)
    out.push(...name, ...file.body)

    push(directory, 0x02014b50, 4)
    push(directory, 20, 2)
    push(directory, 20, 2)
    push(directory, 0, 2)
    push(directory, method, 2)
    push(directory, 0, 4)
    push(directory, 0, 4)
    push(directory, file.body.length, 4)
    push(directory, file.body.length, 4)
    push(directory, name.length, 2)
    push(directory, 0, 2)
    push(directory, 0, 2)
    push(directory, 0, 2)
    push(directory, 0, 2)
    push(directory, 0, 4)
    push(directory, offset, 4)
    directory.push(...name)
  }

  const directoryAt = out.length
  out.push(...directory)
  push(out, 0x06054b50, 4)
  push(out, 0, 2)
  push(out, 0, 2)
  push(out, files.length, 2)
  push(out, files.length, 2)
  push(out, directory.length, 4)
  push(out, directoryAt, 4)
  push(out, 0, 2)
  return Uint8Array.from(out)
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container><rootfiles><rootfile full-path="the score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>`

describe('parseXml', () => {
  it('reads elements, attributes and text', () => {
    const root = parseXml('<a x="1" y="two"><b>text</b><b>more</b></a>')

    expect(root.name).toBe('a')
    expect(root.attributes).toEqual({ x: '1', y: 'two' })
    expect(children(root, 'b').map((element) => element.text)).toEqual(['text', 'more'])
  })

  it('keeps an element text to its own, leaving its children out of it', () => {
    const root = parseXml('<a>mine <b>theirs</b> also mine</a>')

    expect(root.text).toBe('mine  also mine')
    expect(child(root, 'b')?.text).toBe('theirs')
  })

  it('reads an empty element and gives it no text', () => {
    const root = parseXml("<a><b/><c dotted='yes' /></a>")

    expect(child(root, 'b')?.text).toBe('')
    expect(child(root, 'c')?.attributes['dotted']).toBe('yes')
  })

  it('skips the declaration, the doctype, comments and instructions', () => {
    const root = parseXml(
      `<?xml version="1.0"?><!DOCTYPE score [<!ENTITY x "y">]><!-- a note --><a><?php never ?><b/></a>`,
    )

    expect(root.name).toBe('a')
    expect(root.children).toHaveLength(1)
  })

  it('decodes the predefined entities and numeric references', () => {
    const root = parseXml('<a t="&lt;&amp;&gt;">&#65;&#x42;&apos;&quot;</a>')

    expect(root.attributes['t']).toBe('<&>')
    expect(root.text).toBe(`AB'"`)
  })

  it('leaves an entity nobody defined as it was written', () => {
    expect(parseXml('<a>&nbsp;</a>').text).toBe('&nbsp;')
  })

  it('takes CDATA as text and not as markup', () => {
    expect(parseXml('<a><![CDATA[<b>not an element</b>]]></a>').text).toBe('<b>not an element</b>')
  })

  it('drops a namespace prefix, which MusicXML does not use and a serialiser adds', () => {
    const root = parseXml('<mx:score-partwise xmlns:mx="urn:x"><mx:part/></mx:score-partwise>')

    expect(root.name).toBe('score-partwise')
    expect(child(root, 'part')).toBeDefined()
  })

  it('refuses tags that do not nest, naming both', () => {
    expect(() => parseXml('<a><b></a></b>')).toThrow(/<b> is closed by <\/a>/)
  })

  it('refuses an element nothing closes', () => {
    expect(() => parseXml('<a><b></b>')).toThrow(/<a> is never closed/)
  })

  it('refuses a closing tag that opened nothing', () => {
    expect(() => parseXml('<a></a></b>')).toThrow(/closes an element nothing opened/)
  })

  it('refuses a second root', () => {
    expect(() => parseXml('<a/><b/>')).toThrow(/second root element/)
  })

  it('refuses an unquoted attribute, and says where', () => {
    expect(() => parseXml('<a x=1/>')).toThrow(/is not quoted/)
  })

  it('refuses text that holds no element at all', () => {
    expect(() => parseXml('nothing here')).toThrow(/holds no element/)
  })

  it('says which line a refusal is on', () => {
    expect(() => parseXml('<a>\n  <b>\n</a>')).toThrow(/line 3/)
  })
})

describe('the accessors', () => {
  const root = parseXml('<a><n>7</n><n>8</n><word>quarter</word><blank></blank><w v="2.5"/></a>')

  it('reads the first child by name, and nothing for one that is absent', () => {
    expect(child(root, 'n')?.text).toBe('7')
    expect(child(root, 'missing')).toBeUndefined()
    expect(child(undefined, 'n')).toBeUndefined()
  })

  it('reads text, treating an empty element as absent', () => {
    expect(childText(root, 'word')).toBe('quarter')
    expect(childText(root, 'blank')).toBeUndefined()
  })

  it('reads numbers, and refuses to call a word one', () => {
    expect(childNumber(root, 'n')).toBe(7)
    expect(childNumber(root, 'word')).toBeUndefined()
    expect(attributeNumber(child(root, 'w'), 'v')).toBe(2.5)
    expect(attributeNumber(child(root, 'w'), 'missing')).toBeUndefined()
  })
})

describe('musicXmlText', () => {
  it('reads plain markup as it stands', () => {
    expect(musicXmlText(bytes('<a>é</a>'))).toBe('<a>é</a>')
  })

  it('reads a byte order mark off the front rather than into the document', () => {
    const marked = Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes('<a/>')])

    expect(parseXml(musicXmlText(marked)).name).toBe('a')
  })

  it('reads UTF-16 where a mark announces it', () => {
    const text = '<a>é</a>'
    const little: number[] = []
    for (const unit of text) {
      const code = unit.charCodeAt(0)
      little.push(code & 0xff, code >> 8)
    }

    expect(musicXmlText(Uint8Array.from([0xff, 0xfe, ...little]))).toBe(text)
  })

  it('falls back to one byte per character where the bytes are not UTF-8', () => {
    expect(musicXmlText(Uint8Array.from([0x3c, 0x61, 0x3e, 0xe9, 0x3c, 0x2f, 0x61, 0x3e]))).toBe(
      '<a>é</a>',
    )
  })

  it('opens a container and returns the file it names', () => {
    const archive = zip([
      { name: 'META-INF/container.xml', body: bytes(CONTAINER) },
      { name: 'the score.musicxml', body: bytes('<score-partwise/>') },
      { name: 'decoy.xml', body: bytes('<wrong/>') },
    ])

    expect(isCompressedMusicXml(archive)).toBe(true)
    expect(musicXmlText(archive)).toBe('<score-partwise/>')
  })

  it('falls back to the first XML outside META-INF where no container names one', () => {
    const archive = zip([{ name: 'score.xml', body: bytes('<score-partwise/>') }])

    expect(musicXmlText(archive)).toBe('<score-partwise/>')
  })

  it('refuses a container naming a file the archive does not hold', () => {
    const archive = zip([{ name: 'META-INF/container.xml', body: bytes(CONTAINER) }])

    expect(() => musicXmlText(archive)).toThrow(MusicXmlError)
  })

  it('refuses an archive holding no XML at all', () => {
    expect(() => musicXmlText(zip([{ name: 'notes.txt', body: bytes('hello') }]))).toThrow(
      /holds no MusicXML/,
    )
  })

  it('uses the inflate it was handed for a deflated entry', () => {
    const packed = bytes('packed')
    const archive = zip([{ name: 'score.xml', body: packed, method: 8 }])
    const inflate: InflateRaw = () => bytes('<score-partwise/>')

    expect(musicXmlText(archive, inflate)).toBe('<score-partwise/>')
  })

  it('says outright that it was given no way to unpack a deflated entry', () => {
    const archive = zip([{ name: 'score.xml', body: bytes('packed'), method: 8 }])

    expect(() => musicXmlText(archive)).toThrow(/given a way to unpack one/)
  })

  it('refuses a method it does not read, by number', () => {
    const archive = zip([{ name: 'score.xml', body: bytes('packed'), method: 12 }])

    expect(() => musicXmlText(archive, () => bytes(''))).toThrow(/method 12/)
  })

  it('refuses bytes that open like a zip and end like nothing', () => {
    expect(() => musicXmlText(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]))).toThrow(
      /no directory at the end/,
    )
  })
})
