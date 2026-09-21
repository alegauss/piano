import { describe, expect, it } from 'vitest'

import { decodeBytes, decodeLatin1, decodeUtf16, decodeUtf8 } from './text'

/**
 * The decoder the package has instead of TextDecoder. The claims are that it
 * agrees with the platform's on text, and that it says no rather than
 * inventing a character where the bytes are not text at all.
 */

function of(...bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes)
}

describe('decodeUtf8', () => {
  it('reads one, two, three and four byte characters', () => {
    expect(decodeUtf8(of(0x41))).toBe('A')
    expect(decodeUtf8(of(0xc3, 0xa9))).toBe('é')
    expect(decodeUtf8(of(0xe2, 0x99, 0xaa))).toBe('♪')
    expect(decodeUtf8(of(0xf0, 0x9f, 0x8e, 0xb9))).toBe('🎹')
  })

  it('reads a run longer than it builds the string in one go', () => {
    // A piano is four bytes and two UTF-16 units, so three thousand of them
    // cross the chunk boundary many times, and cross it mid-pair.
    const many = Array.from({ length: 3000 }, () => [0xf0, 0x9f, 0x8e, 0xb9]).flat()

    expect(decodeUtf8(Uint8Array.from(many))).toBe('🎹'.repeat(3000))
  })

  it('reads nothing as an empty string rather than as a refusal', () => {
    expect(decodeUtf8(of())).toBe('')
  })

  it('refuses a sequence that stops in the middle', () => {
    expect(decodeUtf8(of(0x41, 0xc3))).toBeNull()
    expect(decodeUtf8(of(0xe2, 0x99))).toBeNull()
  })

  it('refuses a continuation byte where a character should start', () => {
    expect(decodeUtf8(of(0xa9))).toBeNull()
    expect(decodeUtf8(of(0xc3, 0x41))).toBeNull()
  })

  it('refuses a code point written in more bytes than it needs', () => {
    // 0xC0 0x80 is one way of smuggling a NUL past a check that reads bytes.
    expect(decodeUtf8(of(0xc0, 0x80))).toBeNull()
    expect(decodeUtf8(of(0xe0, 0x80, 0xaf))).toBeNull()
  })

  it('refuses half a surrogate pair, which is not a character', () => {
    expect(decodeUtf8(of(0xed, 0xa0, 0x80))).toBeNull()
  })

  it('refuses a lead byte no encoding defines', () => {
    expect(decodeUtf8(of(0xf8, 0x80, 0x80, 0x80, 0x80))).toBeNull()
  })
})

describe('the other two', () => {
  it('reads one byte per character', () => {
    expect(decodeLatin1(of(0x68, 0xe9, 0x21))).toBe('hé!')
  })

  it('reads UTF-16 in either order', () => {
    expect(decodeUtf16(of(0xe9, 0x00, 0x21, 0x00), true)).toBe('é!')
    expect(decodeUtf16(of(0x00, 0xe9, 0x00, 0x21), false)).toBe('é!')
  })

  it('falls back to one byte per character where UTF-8 is refused', () => {
    expect(decodeBytes(of(0x68, 0xe9))).toBe('hé')
    expect(decodeBytes(of(0x68, 0xc3, 0xa9))).toBe('hé')
  })
})
