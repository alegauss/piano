/**
 * What is done to each recording before it is encoded.
 *
 * Trimming, because a library recording carries silence before the hammer and
 * seconds of room noise after the string has died, and both cost bytes and
 * latency. Normalising, once for the whole pack rather than per recording,
 * because the difference in loudness between a soft layer and a loud one is
 * the recording and must survive: a per-file peak would make every layer
 * equally loud and the velocity layers pointless.
 */

/** Interleaved samples, as ffmpeg writes f32le. */
export type Pcm = {
  readonly data: Float32Array
  readonly channels: number
  readonly sampleRate: number
}

export type TrimOptions = {
  /** Where the note starts: the first frame this far below the recording's own peak. */
  readonly onsetDb: number
  /** Where it has died: the last frame this far below the peak. */
  readonly tailDb: number
  /** Kept before the onset, so the hammer's transient is never clipped. */
  readonly prerollSeconds: number
  /** The fade laid over the end, so the cut never clicks. */
  readonly fadeSeconds: number
  /** The longest a recording is kept, however long its string rings. */
  readonly maxSeconds: number
}

export const DEFAULT_TRIM: TrimOptions = {
  onsetDb: -40,
  tailDb: -60,
  prerollSeconds: 0.003,
  fadeSeconds: 0.1,
  maxSeconds: 12,
}

function frames(pcm: Pcm): number {
  return Math.floor(pcm.data.length / pcm.channels)
}

function frameLevel(pcm: Pcm, frame: number): number {
  let level = 0
  for (let channel = 0; channel < pcm.channels; channel += 1) {
    level = Math.max(level, Math.abs(pcm.data[frame * pcm.channels + channel] ?? 0))
  }
  return level
}

/** The largest absolute sample. */
export function peakOf(pcm: Pcm): number {
  let peak = 0
  for (const sample of pcm.data) {
    peak = Math.max(peak, Math.abs(sample))
  }
  return peak
}

function decibels(db: number): number {
  return 10 ** (db / 20)
}

/** Cut a recording to where its note starts and dies, with a fade on the cut. */
export function trim(pcm: Pcm, options: TrimOptions = DEFAULT_TRIM): Pcm {
  const peak = peakOf(pcm)
  if (peak === 0) {
    throw new Error('the recording is silent')
  }
  const total = frames(pcm)

  const onsetLevel = peak * decibels(options.onsetDb)
  let onset = 0
  while (onset < total && frameLevel(pcm, onset) < onsetLevel) {
    onset += 1
  }
  const start = Math.max(0, onset - Math.round(options.prerollSeconds * pcm.sampleRate))

  const tailLevel = peak * decibels(options.tailDb)
  let tail = total - 1
  while (tail > onset && frameLevel(pcm, tail) < tailLevel) {
    tail -= 1
  }
  const end = Math.min(tail + 1, start + Math.round(options.maxSeconds * pcm.sampleRate))

  const data = pcm.data.slice(start * pcm.channels, end * pcm.channels)
  const length = end - start
  const fade = Math.min(length, Math.round(options.fadeSeconds * pcm.sampleRate))
  for (let index = 0; index < fade; index += 1) {
    // A raised cosine from 1 to 0 over the last frames.
    const frame = length - fade + index
    const gain = 0.5 * (1 + Math.cos((Math.PI * (index + 1)) / fade))
    for (let channel = 0; channel < pcm.channels; channel += 1) {
      const at = frame * pcm.channels + channel
      data[at] = (data[at] ?? 0) * gain
    }
  }

  return { data, channels: pcm.channels, sampleRate: pcm.sampleRate }
}

/** The gain that brings a peak to a target level. */
export function gainToPeak(peak: number, targetDb = -1): number {
  if (peak <= 0) {
    throw new Error('there is no peak to normalise to')
  }
  return decibels(targetDb) / peak
}

export function withGain(pcm: Pcm, gain: number): Pcm {
  return {
    data: pcm.data.map((sample) => sample * gain),
    channels: pcm.channels,
    sampleRate: pcm.sampleRate,
  }
}

export function secondsOf(pcm: Pcm): number {
  return frames(pcm) / pcm.sampleRate
}
