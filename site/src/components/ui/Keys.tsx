// The keyboard the page stands on. The app's own screen is notes falling onto a keyboard and
// the key lighting as each one lands, so the hero closes on the same picture: a full 88-key
// keyboard, a few notes falling, and each key glowing as its note arrives.
//
// The fall and the glow are two animations on two elements, kept in step by sharing one
// duration and one delay per note, so they cannot drift apart however long the page is open.
//
// Decorative only: it carries no copy, so it is hidden from the accessibility tree and dropped
// from the Markdown twin, and it stops moving under prefers-reduced-motion.

const WHITE_W = 24
const WHITE_H = 56
const BLACK_W = 14
const BLACK_H = 34
const HEIGHT = 170 // the band: room for a note to fall before it reaches the keys
const FIRST = 21 // A0
const LAST = 108 // C8

const isBlack = (pitch: number) => [1, 3, 6, 8, 10].includes(pitch % 12)

type Key = { pitch: number; x: number; black: boolean }

const KEYS: Key[] = (() => {
  const keys: Key[] = []
  let white = 0
  for (let pitch = FIRST; pitch <= LAST; pitch += 1) {
    if (isBlack(pitch)) {
      keys.push({ pitch, x: white * WHITE_W - BLACK_W / 2, black: true })
    } else {
      keys.push({ pitch, x: white * WHITE_W, black: false })
      white += 1
    }
  }
  return keys
})()

const SPAN = KEYS.filter((k) => !k.black).length * WHITE_W
const TOP = HEIGHT - WHITE_H

// The opening of a phrase around middle C, as the app would draw it: pitch, the moment it
// starts falling, and how long the note is held (the height of its bar).
const NOTES = [
  { pitch: 60, delay: 0, len: 30 },
  { pitch: 64, delay: 0.8, len: 22 },
  { pitch: 67, delay: 1.6, len: 22 },
  { pitch: 72, delay: 2.4, len: 44 },
  { pitch: 70, delay: 3.6, len: 18 },
  { pitch: 69, delay: 4.2, len: 18 },
  { pitch: 65, delay: 4.8, len: 30 },
  { pitch: 62, delay: 5.6, len: 22 },
  { pitch: 48, delay: 0, len: 60 },
  { pitch: 53, delay: 3.2, len: 60 },
] as const

const keyAt = (pitch: number): Key => {
  const key = KEYS.find((k) => k.pitch === pitch)
  if (!key) throw new Error(`Keys: no key for pitch ${pitch}`)
  return key
}

// A black key's note, a bass note and a melody note each take a part colour of their own, the
// way the app colours parts.
function noteClass(key: Key): string {
  if (key.black) return 'key-note key-note--black'
  if (key.pitch < 55) return 'key-note key-note--bass'
  return 'key-note'
}

export function Keys({ className }: { className?: string }) {
  return (
    <div className={className ? `keys ${className}` : 'keys'} aria-hidden="true" data-twin="omit">
      <svg viewBox={`0 0 ${SPAN} ${HEIGHT}`} preserveAspectRatio="xMidYMax slice" focusable="false">
        {NOTES.map((n) => {
          const key = keyAt(n.pitch)
          const w = key.black ? BLACK_W : WHITE_W
          return (
            <rect
              key={`note-${n.pitch}-${n.delay}`}
              className={noteClass(key)}
              x={key.x + 2}
              y={TOP - n.len}
              width={w - 4}
              height={n.len}
              rx="4"
              style={{ animationDelay: `${n.delay}s` }}
            />
          )
        })}
        {KEYS.filter((k) => !k.black).map((k) => (
          <rect
            key={k.pitch}
            className="key-white"
            x={k.x}
            y={TOP}
            width={WHITE_W}
            height={WHITE_H}
            rx="3"
          />
        ))}
        {NOTES.filter((n) => !keyAt(n.pitch).black).map((n) => (
          <rect
            key={`glow-${n.pitch}-${n.delay}`}
            className="key-glow"
            x={keyAt(n.pitch).x}
            y={TOP}
            width={WHITE_W}
            height={WHITE_H}
            rx="3"
            style={{ animationDelay: `${n.delay}s` }}
          />
        ))}
        {KEYS.filter((k) => k.black).map((k) => (
          <rect
            key={k.pitch}
            className="key-black"
            x={k.x}
            y={TOP}
            width={BLACK_W}
            height={BLACK_H}
            rx="2"
          />
        ))}
        {NOTES.filter((n) => keyAt(n.pitch).black).map((n) => (
          <rect
            key={`glow-${n.pitch}-${n.delay}`}
            className="key-glow"
            x={keyAt(n.pitch).x}
            y={TOP}
            width={BLACK_W}
            height={BLACK_H}
            rx="2"
            style={{ animationDelay: `${n.delay}s` }}
          />
        ))}
      </svg>
    </div>
  )
}
