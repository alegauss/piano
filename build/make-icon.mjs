import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Draw the app icon, with no image dependency.
 *
 * electron-builder wants a 512 square PNG and derives the .ico and .icns from
 * it. Pulling in an image library to produce one flat drawing is a dependency
 * that would outlive its reason, and a checked-in binary nobody can regenerate
 * is worse: when the accent colour changes, the icon should change with it.
 * So the icon is a program, and PNG is simple enough to write by hand.
 *
 * The motif is the app itself seen from the front: a few white keys, two black
 * ones, and a note falling onto the keyboard in the accent colour.
 */

const SIZE = 512

/** Dark surface, near --surface-base. */
const BACKGROUND = [0x0e, 0x12, 0x17]
const KEY_WHITE = [0xf2, 0xf4, 0xf7]
const KEY_BLACK = [0x15, 0x18, 0x1d]
const ACCENT = [0x35, 0xb6, 0xf0]

const pixels = Buffer.alloc(SIZE * SIZE * 3)

/** @param {number} x @param {number} y @param {number[]} rgb */
function put(x, y, rgb) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    return
  }
  const at = (y * SIZE + x) * 3
  pixels[at] = rgb[0]
  pixels[at + 1] = rgb[1]
  pixels[at + 2] = rgb[2]
}

/** @param {number} x0 @param {number} y0 @param {number} w @param {number} h @param {number[]} rgb */
function rect(x0, y0, w, h, rgb) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      put(x, y, rgb)
    }
  }
}

/** A rounded rectangle, because a square note cap reads as a bug. */
function roundedRect(x0, y0, w, h, radius, rgb) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const dx = Math.max(x0 + radius - x, x - (x0 + w - 1 - radius), 0)
      const dy = Math.max(y0 + radius - y, y - (y0 + h - 1 - radius), 0)
      if (dx * dx + dy * dy <= radius * radius) {
        put(x, y, rgb)
      }
    }
  }
}

rect(0, 0, SIZE, SIZE, BACKGROUND)

// The keyboard along the bottom third: seven white keys with the usual gaps.
const keyboardTop = 300
const keyboardHeight = 150
const whiteCount = 7
const whiteWidth = Math.floor((SIZE - 96) / whiteCount)
const keyboardLeft = Math.floor((SIZE - whiteWidth * whiteCount) / 2)

for (let i = 0; i < whiteCount; i += 1) {
  roundedRect(
    keyboardLeft + i * whiteWidth + 3,
    keyboardTop,
    whiteWidth - 6,
    keyboardHeight,
    10,
    KEY_WHITE,
  )
}

// Black keys sit between the white ones, in the real pattern: after the first
// two and after the next three, never after the third or the seventh.
const blackAfter = [0, 1, 3, 4, 5]
const blackWidth = Math.round(whiteWidth * 0.58)
for (const i of blackAfter) {
  const centre = keyboardLeft + (i + 1) * whiteWidth
  roundedRect(
    centre - Math.floor(blackWidth / 2),
    keyboardTop,
    blackWidth,
    Math.round(keyboardHeight * 0.62),
    8,
    KEY_BLACK,
  )
}

// A note falling onto the fourth key, which is what the whole app is about.
const noteWidth = whiteWidth - 26
const noteLeft = keyboardLeft + 3 * whiteWidth + 13
roundedRect(noteLeft, 96, noteWidth, 176, 16, ACCENT)

/** PNG needs a filter byte at the start of every scanline; 0 means none. */
const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE)
for (let y = 0; y < SIZE; y += 1) {
  raw[y * (SIZE * 3 + 1)] = 0
  pixels.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3)
}

/** @param {string} type @param {Buffer} data */
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

/** @type {number[]} */
const CRC_TABLE = []
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c
}

/** @param {Buffer} buffer */
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  }
  return c ^ 0xffffffff
}

const header = Buffer.alloc(13)
header.writeUInt32BE(SIZE, 0)
header.writeUInt32BE(SIZE, 4)
header[8] = 8 // bit depth
header[9] = 2 // truecolour
header[10] = 0
header[11] = 0
header[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const outDir = fileURLToPath(new URL('.', import.meta.url))
await mkdir(outDir, { recursive: true })
const file = fileURLToPath(new URL('./icon.png', import.meta.url))
await writeFile(file, png)
process.stdout.write(`icon: wrote ${String(png.length)} bytes to ${file}\n`)
