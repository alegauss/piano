/**
 * Where each of the 88 keys is, as a pianist's eye expects it.
 *
 * The keyboard is the roll's coordinate system: every falling note is drawn at
 * its key's position from this one function, so a note cannot land beside the
 * key it sounds.
 *
 * White keys are equal. Black keys are not placed on an even grid, because a
 * real keyboard does not place them so: the back of the C-to-E group is
 * divided into five equal widths and the back of the F-to-B group into seven,
 * which spaces C sharp and D sharp differently from F sharp, G sharp and A
 * sharp. That difference is small and immediately visible to anyone who
 * plays.
 */

export const LOWEST_KEY = 21
export const HIGHEST_KEY = 108
export const WHITE_KEY_COUNT = 52

/** How far down a white key a black key reaches. */
export const BLACK_KEY_LENGTH = 0.64

/** Where a key starts within its octave and how wide it is, in white-key widths from C. */
const OCTAVE: readonly {
  readonly left: number
  readonly width: number
  readonly black: boolean
}[] = [
  { left: 0, width: 1, black: false }, // C
  { left: 3 / 5, width: 3 / 5, black: true }, // C#
  { left: 1, width: 1, black: false }, // D
  { left: 9 / 5, width: 3 / 5, black: true }, // D#
  { left: 2, width: 1, black: false }, // E
  { left: 3, width: 1, black: false }, // F
  { left: 3 + 4 / 7, width: 4 / 7, black: true }, // F#
  { left: 4, width: 1, black: false }, // G
  { left: 3 + 12 / 7, width: 4 / 7, black: true }, // G#
  { left: 5, width: 1, black: false }, // A
  { left: 3 + 20 / 7, width: 4 / 7, black: true }, // A#
  { left: 6, width: 1, black: false }, // B
]

/** Where A0 falls in white-key widths from the C below it, which is where the keyboard starts. */
const KEYBOARD_START = keyInWhiteWidths(LOWEST_KEY).left

function keyInWhiteWidths(pitch: number): { left: number; width: number; black: boolean } {
  const octave = Math.floor(pitch / 12)
  const place = OCTAVE[((pitch % 12) + 12) % 12] ?? { left: 0, width: 1, black: false }
  return { left: octave * 7 + place.left, width: place.width, black: place.black }
}

export function isBlackKey(pitch: number): boolean {
  return keyInWhiteWidths(pitch).black
}

export type KeyRect = {
  readonly pitch: number
  /** From the keyboard's left edge. */
  readonly x: number
  readonly width: number
  readonly black: boolean
}

/**
 * The horizontal place of a key on a keyboard a given width across: the
 * function the roll calls for every note it draws. Null outside the 88 keys.
 */
export function keyRect(pitch: number, keyboardWidth: number): KeyRect | null {
  if (!Number.isInteger(pitch) || pitch < LOWEST_KEY || pitch > HIGHEST_KEY) {
    return null
  }
  const white = keyboardWidth / WHITE_KEY_COUNT
  const key = keyInWhiteWidths(pitch)
  return {
    pitch,
    x: (key.left - KEYBOARD_START) * white,
    width: key.width * white,
    black: key.black,
  }
}

/** Every key, white keys first so black keys can be drawn over them. */
export function keyboardLayout(keyboardWidth: number): KeyRect[] {
  const keys: KeyRect[] = []
  for (let pitch = LOWEST_KEY; pitch <= HIGHEST_KEY; pitch += 1) {
    const rect = keyRect(pitch, keyboardWidth)
    if (rect !== null) {
      keys.push(rect)
    }
  }
  return keys.sort((a, b) => Number(a.black) - Number(b.black) || a.pitch - b.pitch)
}
