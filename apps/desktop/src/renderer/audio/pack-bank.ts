import { parseManifest, type Credit, type PackManifest } from '@piano/sample-pack'

import { decodedBytes, registerFor, registersOf, sampleFor, type Register } from './pack-registers'
import type { Sample, SampleBank } from './sampled-engine'

/**
 * A sample pack, loaded as it is needed and no more.
 *
 * Decoded audio is ten times the size of the compressed pack, so it is held
 * to a budget: loading a register that would pass it first evicts the
 * registers used least recently, and a register that cannot fit at all is not
 * kept, its keys left to the synthesised fallback. A key asked for before its
 * register has arrived answers nothing and starts the register loading, so
 * the engine falls back for that note and plays the recording from the next.
 */

/** Where a pack's files come from: a directory on disk in the app, a map in a test. */
export type PackSource = {
  /** The manifest, as JSON not yet trusted. */
  manifest(): Promise<unknown>
  /** A file the manifest names, by its path relative to the manifest. */
  file(path: string): Promise<ArrayBuffer>
}

/** A pack served over a URL, which is how the renderer reaches one. */
export function urlPackSource(base: string, fetcher: typeof fetch = fetch): PackSource {
  const root = base.endsWith('/') ? base : `${base}/`
  const get = async (path: string) => {
    const response = await fetcher(new URL(path, root))
    if (!response.ok) {
      throw new Error(`the sample pack has no ${path} (${String(response.status)})`)
    }
    return response
  }
  return {
    manifest: async () => (await get('manifest.json')).json() as Promise<unknown>,
    file: async (path) => (await get(path)).arrayBuffer(),
  }
}

/** Half the pack, decoded: enough for most pieces, and a ceiling nobody will blame on the piano. */
export const DEFAULT_BUDGET_BYTES = 192 * 1024 * 1024

export type PackProgress = {
  readonly loaded: number
  readonly total: number
  readonly decodedBytes: number
}

type Resident = {
  readonly buffers: ReadonlyMap<string, AudioBuffer>
  readonly bytes: number
  lastUsed: number
}

export class PackBank implements SampleBank {
  private readonly registers: readonly Register[]
  private readonly resident = new Map<number, Resident>()
  private readonly loading = new Map<number, Promise<void>>()
  /** Bytes promised to registers still decoding, so two loads cannot both take the last room. */
  private reserved = 0
  private uses = 0
  private readonly listeners = new Set<(progress: PackProgress) => void>()

  private constructor(
    private readonly context: BaseAudioContext,
    private readonly source: PackSource,
    readonly manifest: PackManifest,
    readonly budgetBytes: number,
  ) {
    this.registers = registersOf(manifest)
  }

  /** Read and check a pack's manifest; nothing is decoded yet. */
  static async open(
    context: BaseAudioContext,
    source: PackSource,
    options: { readonly budgetBytes?: number } = {},
  ): Promise<PackBank> {
    const checked = parseManifest(await source.manifest())
    if (!checked.ok) {
      throw new Error(
        `the sample pack's manifest cannot be used: ${checked.problems.slice(0, 3).join('; ')}`,
      )
    }
    return new PackBank(
      context,
      source,
      checked.manifest,
      options.budgetBytes ?? DEFAULT_BUDGET_BYTES,
    )
  }

  /** Who made the recordings and under what licence: what the app shows once a pack is in. */
  get credit(): Credit {
    return this.manifest.credit
  }

  /** Decoded audio held right now, in bytes. Never more than the budget. */
  get decodedBytes(): number {
    let total = 0
    for (const register of this.resident.values()) {
      total += register.bytes
    }
    return total
  }

  /** The keys whose recordings are loaded, by the key each register was recorded on. */
  get loadedRegisters(): readonly number[] {
    return [...this.resident.keys()].sort((a, b) => a - b)
  }

  get progress(): PackProgress {
    return {
      loaded: this.resident.size,
      total: this.registers.length,
      decodedBytes: this.decodedBytes,
    }
  }

  onProgress(listener: (progress: PackProgress) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Load what these keys need, keeping it resident while the rest makes room. */
  async load(pitches: ReadonlySet<number>): Promise<void> {
    const needed = this.registers.filter((register) =>
      [...pitches].some((key) => key >= register.lowKey && key <= register.highKey),
    )
    const keep = new Set(needed.map((register) => register.pitch))
    for (const register of needed) {
      await this.loadRegister(register, keep)
    }
  }

  /**
   * Load registers outward from middle C for as long as they fit without
   * evicting anything: the background fill after the first notes.
   */
  async preload(): Promise<void> {
    for (const register of this.registers) {
      const cost = decodedBytes(register, this.context.sampleRate, this.manifest.channels)
      if (this.decodedBytes + this.reserved + cost > this.budgetBytes) {
        return
      }
      await this.loadRegister(register, new Set())
    }
  }

  sampleFor(pitch: number, velocity: number): Sample | null {
    const sample = sampleFor(this.manifest, pitch, velocity)
    if (sample === undefined) {
      return null
    }
    const resident = this.resident.get(sample.pitch)
    const buffer = resident?.buffers.get(sample.file)
    if (resident === undefined || buffer === undefined) {
      const register = registerFor(this.registers, pitch)
      if (register !== undefined) {
        // This note falls back; the next one on this key should not.
        void this.loadRegister(register, new Set()).catch(() => {})
      }
      return null
    }
    this.uses += 1
    resident.lastUsed = this.uses
    return {
      pitch: sample.pitch,
      buffer,
      ...(sample.tuneCents !== undefined ? { tuneCents: sample.tuneCents } : {}),
    }
  }

  private loadRegister(register: Register, keep: ReadonlySet<number>): Promise<void> {
    const resident = this.resident.get(register.pitch)
    if (resident !== undefined) {
      this.uses += 1
      resident.lastUsed = this.uses
      return Promise.resolve()
    }
    const pending = this.loading.get(register.pitch)
    if (pending !== undefined) {
      return pending
    }

    const loading = this.decode(register, keep).finally(() => {
      this.loading.delete(register.pitch)
    })
    this.loading.set(register.pitch, loading)
    return loading
  }

  private async decode(register: Register, keep: ReadonlySet<number>): Promise<void> {
    const estimate = decodedBytes(register, this.context.sampleRate, this.manifest.channels)
    if (!this.makeRoom(estimate, keep, register.pitch)) {
      return
    }
    this.reserved += estimate
    let buffers: Map<string, AudioBuffer>
    try {
      buffers = new Map(
        await Promise.all(
          register.samples.map(async (sample) => {
            const encoded = await this.source.file(sample.file)
            const decoded = await this.context.decodeAudioData(encoded)
            return [sample.file, decoded] as const
          }),
        ),
      )
    } finally {
      this.reserved -= estimate
    }

    let bytes = 0
    for (const buffer of buffers.values()) {
      bytes += buffer.length * buffer.numberOfChannels * 4
    }
    // The estimate is close but not exact; the budget is exact.
    if (!this.makeRoom(bytes, keep, register.pitch)) {
      return
    }
    this.uses += 1
    this.resident.set(register.pitch, { buffers, bytes, lastUsed: this.uses })
    const progress = this.progress
    for (const listener of this.listeners) {
      listener(progress)
    }
  }

  /**
   * Evict least recently used registers until `bytes` fits, sparing those in
   * `keep`. Answers false, evicting nothing, when it cannot fit at all.
   */
  private makeRoom(bytes: number, keep: ReadonlySet<number>, loading: number): boolean {
    const evictable = [...this.resident.entries()]
      .filter(([pitch]) => !keep.has(pitch) && pitch !== loading)
      .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
    const freeable = evictable.reduce((sum, [, register]) => sum + register.bytes, 0)
    const used = this.decodedBytes + this.reserved
    if (used - freeable + bytes > this.budgetBytes) {
      return false
    }
    let current = used
    for (const [pitch, register] of evictable) {
      if (current + bytes <= this.budgetBytes) {
        break
      }
      this.resident.delete(pitch)
      current -= register.bytes
    }
    return true
  }
}
