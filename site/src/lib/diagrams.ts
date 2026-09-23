// The illustrative figures, kept as verbatim SVG. They are drawn in the app's own dark-theme
// colours (the values tokens.css gives the roll, the parts and the keys), because they stand in
// for a screenshot of the app, and a screenshot keeps its own palette whatever the page's theme.

const WHITE = 22
const KEYS_TOP = 262
const KEYS_H = 78
const FIRST = 48 // C3
const WHITES = 26

const isBlack = (p: number) => [1, 3, 6, 8, 10].includes(p % 12)

function xOf(pitch: number): { x: number; w: number } {
  let white = 0
  for (let p = FIRST; p < pitch; p += 1) if (!isBlack(p)) white += 1
  return isBlack(pitch) ? { x: 20 + white * WHITE - 7, w: 14 } : { x: 20 + white * WHITE, w: WHITE }
}

// part colours: note-part-1 (melody), note-part-2 (bass), note-part-3 (harmony)
const PART = ['#00a5e4', '#45e8e8', '#7e72e7']

// pitch, bottom edge above the keys (0 = sounding now), length, part
const NOTES: [number, number, number, number][] = [
  [72, 0, 34, 0],
  [74, 44, 30, 0],
  [76, 84, 30, 0],
  [77, 124, 22, 0],
  [79, 154, 60, 0],
  [48, 0, 90, 1],
  [55, 100, 90, 1],
  [64, 10, 64, 2],
  [67, 10, 64, 2],
  [65, 110, 60, 2],
]

function roll(): string {
  const parts: string[] = []
  parts.push(
    '<svg viewBox="0 0 612 360" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The Piano app: coloured notes falling onto an on-screen keyboard, with the key under the sounding note lit and a timing lane above the keys">',
    '<rect width="612" height="360" rx="14" fill="#0b0d12"/>',
  )
  // bar lines
  for (let y = 40; y < KEYS_TOP; y += 70) {
    parts.push(`<line x1="20" y1="${y}" x2="592" y2="${y}" stroke="#20242c" stroke-width="1"/>`)
  }
  for (const [pitch, above, len, part] of NOTES) {
    const { x, w } = xOf(pitch)
    const bottom = KEYS_TOP - 14 - above
    parts.push(
      `<rect x="${x + 2}" y="${bottom - len}" width="${w - 4}" height="${len}" rx="5" fill="${PART[part]}"/>`,
    )
  }
  // the timing lane: dashes for notes played early (left of centre) and late (right)
  parts.push(`<rect x="20" y="${KEYS_TOP - 12}" width="572" height="10" fill="#171b21"/>`)
  for (const [pitch, dx, colour] of [
    [72, -3, '#59d38c'],
    [48, 4, '#ffd96a'],
    [64, 1, '#59d38c'],
    [67, -5, '#ffd96a'],
  ] as const) {
    const { x, w } = xOf(pitch)
    parts.push(
      `<rect x="${x + w / 2 - 5 + dx}" y="${KEYS_TOP - 10}" width="10" height="6" rx="2" fill="${colour}"/>`,
    )
  }
  const sounding = new Set(NOTES.filter((n) => n[1] <= 10).map((n) => n[0]))
  for (let i = 0, p = FIRST; i < WHITES; p += 1) {
    if (isBlack(p)) continue
    const lit = sounding.has(p)
    parts.push(
      `<rect x="${20 + i * WHITE + 1}" y="${KEYS_TOP}" width="${WHITE - 2}" height="${KEYS_H}" rx="3" fill="${lit ? '#8dceee' : '#edeef1'}"/>`,
    )
    i += 1
  }
  for (let p = FIRST; p < FIRST + 44; p += 1) {
    if (!isBlack(p)) continue
    const { x, w } = xOf(p)
    if (x + w > 592) break
    parts.push(
      `<rect x="${x}" y="${KEYS_TOP}" width="${w}" height="${KEYS_H * 0.6}" rx="2" fill="${sounding.has(p) ? '#005e82' : '#1c1f25'}"/>`,
    )
  }
  parts.push('</svg>')
  return parts.join('')
}

export const rollDiagram = roll()
