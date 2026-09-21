import type { PackManifest, PackSample } from '@piano/sample-pack'
import { describe, expect, it } from 'vitest'

import { pianoOn } from './index'
import { PackBank, type PackSource } from './pack-bank'
import { SampledEngine } from './sampled-engine'

/**
 * A pack made on the spot and loaded the way the app loads one.
 *
 * Every recording is a sine at 1000 Hz, which nothing synthesised here
 * produces for the key it is played on: so what comes out of a render says
 * which of the two engines answered the note.
 */

const RATE = 22_050
const RECORDED_HZ = 1000
const SECONDS = 0.5

/** A mono 16-bit WAV file, which Chromium decodes without any codec. */
function wav(frequency: number, seconds: number): ArrayBuffer {
  const frames = Math.round(seconds * RATE)
  const buffer = new ArrayBuffer(44 + frames * 2)
  const view = new DataView(buffer)
  const text = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(at + index, value.charCodeAt(index))
    }
  }
  text(0, 'RIFF')
  view.setUint32(4, 36 + frames * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, RATE, true)
  view.setUint32(28, RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  text(36, 'data')
  view.setUint32(40, frames * 2, true)
  for (let frame = 0; frame < frames; frame += 1) {
    const value = Math.sin((2 * Math.PI * frequency * frame) / RATE) * 0.8
    view.setInt16(44 + frame * 2, Math.round(value * 32_767), true)
  }
  return buffer
}

type Layer = { readonly upTo: number; readonly hz: number }

/**
 * Thirty registers, a minor third apart from A0 to C8, each with the velocity
 * layers asked for: by default one, a 1000 Hz sine.
 */
function syntheticPack(layers: readonly Layer[] = [{ upTo: 127, hz: RECORDED_HZ }]): {
  manifest: PackManifest
  files: Map<string, ArrayBuffer>
} {
  const samples: PackSample[] = []
  const files = new Map<string, ArrayBuffer>()
  for (let pitch = 21; pitch <= 108; pitch += 3) {
    let from = 1
    for (const layer of layers) {
      const file = `samples/${String(pitch)}-${String(layer.upTo)}.wav`
      samples.push({
        file,
        pitch,
        lowKey: pitch === 21 ? 21 : pitch - 1,
        highKey: pitch === 108 ? 108 : pitch === 21 ? 22 : pitch + 1,
        lowVelocity: from,
        highVelocity: layer.upTo,
        seconds: SECONDS,
        bytes: 1,
        sha256: '0'.repeat(64),
      })
      files.set(file, wav(layer.hz, SECONDS))
      from = layer.upTo + 1
    }
  }
  const manifest: PackManifest = {
    format: 1,
    id: 'test-pack',
    version: 1,
    sampleRate: RATE,
    channels: 1,
    credit: {
      title: 'Test pack',
      author: 'Nobody',
      licence: 'CC0-1.0',
      licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      source: 'https://example.com/',
      licenceFile: 'LICENSE.txt',
    },
    samples,
  }
  return { manifest, files }
}

/** One register, decoded, in bytes. */
const REGISTER_BYTES = Math.ceil(SECONDS * RATE) * 4

/** A source whose files wait until the test opens the gate, and which counts them. */
function source(manifest: unknown, files: Map<string, ArrayBuffer>) {
  let open: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  let fetched = 0
  const pack: PackSource & { open(): void; readonly fetched: number } = {
    manifest: () => Promise.resolve(manifest),
    file: async (path) => {
      await gate
      fetched += 1
      const bytes = files.get(path)
      if (bytes === undefined) {
        throw new Error(`no ${path}`)
      }
      return bytes.slice(0)
    },
    open: () => {
      open()
    },
    get fetched() {
      return fetched
    },
  }
  return pack
}

function offline(seconds: number): OfflineAudioContext {
  return new OfflineAudioContext(1, Math.round(seconds * RATE), RATE)
}

function frequency(data: Float32Array, from: number, to: number): number {
  let crossings = 0
  for (let index = Math.round(from * RATE) + 1; index < Math.round(to * RATE); index += 1) {
    if ((data[index - 1] ?? 0) < 0 && (data[index] ?? 0) >= 0) {
      crossings += 1
    }
  }
  return crossings / (to - from)
}

describe('velocity layers', () => {
  const layers = [
    { upTo: 63, hz: 500 },
    { upTo: 127, hz: 1500 },
  ]

  async function strike(velocity: number): Promise<Float32Array> {
    const { manifest, files } = syntheticPack(layers)
    const context = offline(0.6)
    const pack = source(manifest, files)
    pack.open()
    const bank = await PackBank.open(context, pack)
    await bank.load(new Set([60]))
    const engine = new SampledEngine(context, bank)
    engine.noteOn(60, velocity, 0)
    return (await context.startRendering()).getChannelData(0)
  }

  it('plays a soft note from the soft recording and a hard one from the hard one', async () => {
    // Middle C was recorded at middle C, so each layer sounds at its own frequency.
    expect(frequency(await strike(20), 0.05, 0.45)).toBeCloseTo(500, -1)
    expect(frequency(await strike(120), 0.05, 0.45)).toBeCloseTo(1500, -1)
  })

  it('crossfades the two layers at equal power near the line between them', async () => {
    const { manifest, files } = syntheticPack(layers)
    const pack = source(manifest, files)
    pack.open()
    const bank = await PackBank.open(offline(1), pack)
    await bank.load(new Set([60]))

    expect(bank.samplesFor(60, 40)).toHaveLength(1)
    const edge = bank.samplesFor(60, 63)
    expect(edge).toHaveLength(2)
    const power = edge.reduce((sum, layer) => sum + layer.gain ** 2, 0)
    expect(power).toBeCloseTo(1, 6)
    // Either side of the line the blend is the mirror image, so nothing steps.
    const [below] = bank.samplesFor(60, 63)
    const [above] = bank.samplesFor(60, 64)
    expect(below?.gain).toBeCloseTo(above?.gain ?? 0, 6)
  })
})

describe('PackBank', () => {
  it('refuses a pack whose manifest leaves keys unplayable', async () => {
    const { manifest, files } = syntheticPack()
    const holed = { ...manifest, samples: manifest.samples.slice(1) }
    await expect(PackBank.open(offline(1), source(holed, files))).rejects.toThrow(/nothing plays/)
  })

  it('plays the first note at once, synthesised, and the recording once its register lands', async () => {
    const { manifest, files } = syntheticPack()
    const context = offline(2.5)
    const pack = source(manifest, files)
    const piano = pianoOn(context)

    // Cold: nothing decoded, and nothing can be until the gate opens.
    const bank = await piano.usePack(pack)
    expect(bank.loadedRegisters).toEqual([])
    piano.engine.noteOn(69, 100, 0.1)
    piano.engine.noteOff(69, 0.9)

    pack.open()
    await bank.load(new Set([69]))
    piano.engine.noteOn(69, 100, 1.2)
    piano.engine.noteOff(69, 1.6)

    const data = (await context.startRendering()).getChannelData(0)
    // A4 synthesised is 440 Hz; the recording is 1000 Hz.
    expect(frequency(data, 0.2, 0.8)).toBeCloseTo(440, -1)
    expect(frequency(data, 1.25, 1.55)).toBeCloseTo(RECORDED_HZ, -1)
  })

  it('is ready at once as a fallback engine, before a single recording has arrived', async () => {
    const { manifest, files } = syntheticPack()
    const context = offline(1)
    const pack = source(manifest, files)
    const bank = await PackBank.open(context, pack)
    const engine = new SampledEngine(context, bank, { fallback: true })
    // The gate is shut, so this resolving proves it did not wait for a file.
    await engine.prepare({
      formatVersion: 1,
      metadata: { title: 'Scale' },
      notes: [{ pitch: 60, start: 0, duration: 480, velocity: 80 }],
    })
    expect(pack.fetched).toBe(0)
  })

  it('keeps decoded audio inside its budget, evicting the register used least recently', async () => {
    const { manifest, files } = syntheticPack()
    const pack = source(manifest, files)
    pack.open()
    const bank = await PackBank.open(offline(1), pack, { budgetBytes: 3 * REGISTER_BYTES })

    for (const key of [60, 72, 84]) {
      await bank.load(new Set([key]))
      expect(bank.decodedBytes).toBeLessThanOrEqual(bank.budgetBytes)
    }
    // Middle C is played again, so the register at 72 is now the stalest.
    expect(bank.samplesFor(60, 80)).toHaveLength(1)
    await bank.load(new Set([96]))

    expect(bank.loadedRegisters).toEqual([60, 84, 96])
    expect(bank.decodedBytes).toBe(3 * REGISTER_BYTES)
    expect(bank.decodedBytes).toBeLessThanOrEqual(bank.budgetBytes)
  })

  it('keeps nothing that cannot fit at all, and leaves those keys to the synthesiser', async () => {
    const { manifest, files } = syntheticPack()
    const pack = source(manifest, files)
    pack.open()
    const bank = await PackBank.open(offline(1), pack, { budgetBytes: REGISTER_BYTES - 1 })
    await bank.load(new Set([60]))
    expect(bank.loadedRegisters).toEqual([])
    expect(bank.decodedBytes).toBe(0)
    expect(bank.samplesFor(60, 80)).toEqual([])
  })

  it('fills outward from middle C for as long as the budget allows without evicting', async () => {
    const { manifest, files } = syntheticPack()
    const pack = source(manifest, files)
    pack.open()
    const bank = await PackBank.open(offline(1), pack, { budgetBytes: 4 * REGISTER_BYTES })
    const seen: number[] = []
    bank.onProgress((progress) => seen.push(progress.loaded))
    await bank.preload()
    expect(bank.loadedRegisters).toEqual([54, 57, 60, 63])
    expect(seen).toEqual([1, 2, 3, 4])
  })

  it('starts loading a key it could not play, so the next note on it is a recording', async () => {
    const { manifest, files } = syntheticPack()
    const pack = source(manifest, files)
    pack.open()
    const bank = await PackBank.open(offline(1), pack)
    expect(bank.samplesFor(90, 80)).toEqual([])
    await bank.load(new Set([90]))
    expect(bank.samplesFor(90, 80)).toHaveLength(1)
    // One fetch: the miss and the load shared a register rather than fetching it twice.
    expect(pack.fetched).toBe(1)
  })
})
