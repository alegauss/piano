import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, open, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { PackProgressPush, PackSourceResponse } from '@piano/ipc'
import { parseManifest, type PackManifest } from '@piano/sample-pack'

import { replace } from './replace'

/**
 * Fetching the sample pack on first run.
 *
 * The pack is far too large for an installer people download from a page, so
 * it arrives afterwards, and the download behaves like one rather than a
 * hopeful fetch. It says how big it is before it starts. Every file lands in a
 * staging folder beside the installed pack and is checked against the sha256
 * the manifest lists for it; a file cut short is continued from where it
 * stopped with a range request, and one already whole and verified is not
 * fetched again, so an interrupted or cancelled download picks up where it
 * left off. Only when every file has been verified is the manifest written and
 * the folder moved into place, so the app never sees half a pack. Meanwhile
 * it plays on the synthesised engine, which is the reason that engine exists.
 *
 * The manifest comes off the network and is not trusted: it is checked by the
 * same parser the app reads it with, and no file it names may land outside the
 * staging folder, whatever path it spells.
 */

/**
 * Where releases publish the pack, as a folder holding its manifest and the
 * files it lists. Nothing publishes one yet (PI64 does), so until then the
 * download is offered only where PIANO_PACK_URL names a folder, and the pack
 * can be put in place by hand.
 */
export const PUBLISHED_PACK: string | null = null

/** Where to download the pack from: PIANO_PACK_URL, or where releases publish it. */
export function packSourceUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const named = env['PIANO_PACK_URL']
  return named !== undefined && named.trim() !== '' ? named.trim() : PUBLISHED_PACK
}

/** A pack larger than this is not the piano this app knows, and is not downloaded. */
export const MAX_PACK_BYTES = 2 * 1024 * 1024 * 1024

/** How many files are fetched at once. */
const PARALLEL = 4

/** The only shapes a file in a pack may have, which is what keeps one inside the folder. */
const RECORDING = /^(?:samples|releases)\/[A-Za-z0-9_-]+\.(?:ogg|wav)$/
const LICENCE = /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9]+)?$/

type Wanted = {
  readonly path: string
  /** Null for the licence, which the manifest names but does not measure. */
  readonly bytes: number | null
  readonly sha256: string | null
}

export type PackDownloader = {
  /** What would be downloaded, and how big it is, before anything is. */
  readonly source: () => Promise<PackSourceResponse>
  /** Fetch whatever is missing, verify all of it and put the pack in place. */
  readonly download: (
    progress: (update: PackProgressPush) => void,
  ) => Promise<{ readonly installed: boolean; readonly reason: string }>
  /** Stop, keeping what has arrived for the next attempt. */
  readonly cancel: () => void
}

function urlOf(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.split('/').map(encodeURIComponent).join('/')}`
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

/**
 * Why a download stopped, said for a person. A dropped connection reaches
 * here as fetch's own one word, which tells nobody what to do next.
 */
function reasonOf(error: unknown): string {
  if (error instanceof TypeError && /^(terminated|fetch failed)$/.test(error.message)) {
    return 'the connection was lost; what arrived is kept for next time'
  }
  return error instanceof Error ? error.message : String(error)
}

function wantedOf(manifest: PackManifest): Wanted[] {
  return [
    ...manifest.samples.map((one) => ({ path: one.file, bytes: one.bytes, sha256: one.sha256 })),
    ...(manifest.releases?.samples ?? []).map((one) => ({
      path: one.file,
      bytes: one.bytes,
      sha256: one.sha256,
    })),
    { path: manifest.credit.licenceFile, bytes: null, sha256: null },
  ]
}

/** Why a manifest from the network cannot be used, or null when it can. */
function unsafe(wanted: readonly Wanted[]): string | null {
  for (const one of wanted) {
    const shaped = one.sha256 === null ? LICENCE.test(one.path) : RECORDING.test(one.path)
    if (!shaped) {
      return `the pack names a file "${one.path}" that cannot be inside it`
    }
  }
  const total = wanted.reduce((sum, one) => sum + (one.bytes ?? 0), 0)
  return total > MAX_PACK_BYTES ? 'the pack is larger than any piano this app knows' : null
}

export function createPackDownloader(options: {
  /** Where the pack is published, or null where nowhere has been set. */
  readonly base: string | null
  /** Where the pack is installed; the staging folder sits beside it. */
  readonly directory: string
  readonly fetch?: typeof fetch
}): PackDownloader {
  const get = options.fetch ?? fetch
  const staging = `${options.directory}.partial`
  let controller: AbortController | null = null
  let running: Promise<{ readonly installed: boolean; readonly reason: string }> | null = null

  const manifest = async (
    signal?: AbortSignal,
  ): Promise<{ manifest: PackManifest; text: string; wanted: Wanted[] }> => {
    if (options.base === null) {
      throw new Error('no download location is set for the sample pack')
    }
    const response = await get(urlOf(options.base, 'manifest.json'), signal ? { signal } : {})
    if (!response.ok) {
      throw new Error(
        `the pack's manifest could not be fetched: the server said ${String(response.status)}`,
      )
    }
    const text = await response.text()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('the pack’s manifest is not JSON')
    }
    const checked = parseManifest(raw)
    if (!checked.ok) {
      throw new Error(`the pack’s manifest cannot be used: ${checked.problems[0] ?? ''}`)
    }
    const wanted = wantedOf(checked.manifest)
    const refused = unsafe(wanted)
    if (refused !== null) {
      throw new Error(refused)
    }
    return { manifest: checked.manifest, text, wanted }
  }

  /** One file, continued from where it stopped, and checked before it counts. */
  const fetchOne = async (
    base: string,
    one: Wanted,
    signal: AbortSignal,
    arrived: (bytes: number) => void,
  ): Promise<void> => {
    const path = join(staging, ...one.path.split('/'))
    await mkdir(dirname(path), { recursive: true })
    let have = await sizeOf(path)
    if (one.bytes !== null && have === one.bytes && (await sha256Of(path)) === one.sha256) {
      arrived(have)
      return
    }
    if (one.bytes === null || have >= one.bytes) {
      have = 0
    }
    const response = await get(urlOf(base, one.path), {
      signal,
      ...(have > 0 ? { headers: { Range: `bytes=${String(have)}-` } } : {}),
    })
    const resumed = response.status === 206
    if (!response.ok || response.body === null) {
      throw new Error(
        `${one.path} could not be fetched: the server said ${String(response.status)}`,
      )
    }
    if (!resumed) {
      have = 0
    }
    arrived(have)
    const file = await open(path, resumed ? 'a' : 'w')
    let written = have
    try {
      for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
        written += chunk.byteLength
        if (one.bytes !== null && written > one.bytes) {
          throw new Error(`${one.path} is larger than the manifest says`)
        }
        await file.write(chunk)
        arrived(chunk.byteLength)
      }
    } finally {
      await file.close()
    }
    if (one.sha256 !== null && (await sha256Of(path)) !== one.sha256) {
      await rm(path, { force: true })
      throw new Error(`${one.path} did not match its checksum, so it was thrown away; try again`)
    }
  }

  /** Put the verified folder where the app looks, never leaving it half-replaced. */
  const install = async (text: string): Promise<void> => {
    await writeFile(join(staging, 'manifest.json'), text, 'utf8')
    const old = `${options.directory}.old`
    await rm(old, { recursive: true, force: true })
    // Whatever is there, an older pack or the wreck of a hand-made one, is set aside.
    const had = existsSync(options.directory)
    if (had) {
      await replace(options.directory, old)
    }
    try {
      await replace(staging, options.directory)
    } catch (error: unknown) {
      if (had) {
        await replace(old, options.directory)
      }
      throw error
    }
    await rm(old, { recursive: true, force: true })
  }

  const run = async (
    progress: (update: PackProgressPush) => void,
  ): Promise<{ readonly installed: boolean; readonly reason: string }> => {
    const base = options.base
    controller = new AbortController()
    const { signal } = controller
    try {
      const { text, wanted } = await manifest(signal)
      const total = wanted.reduce((sum, one) => sum + (one.bytes ?? 0), 0)
      let done = 0
      let told = 0
      const arrived = (bytes: number) => {
        done += bytes
        const now = Date.now()
        if (now - told > 100) {
          told = now
          progress({ phase: 'downloading', bytes: Math.min(done, total), total })
        }
      }
      progress({ phase: 'downloading', bytes: 0, total })
      const queue = [...wanted]
      // The licence is fetched but not counted: the manifest does not say its size.
      const uncounted = () => {}
      const worker = async () => {
        for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
          await fetchOne(base ?? '', next, signal, next.bytes === null ? uncounted : arrived)
        }
      }
      await Promise.all(Array.from({ length: PARALLEL }, worker))
      progress({ phase: 'installing', bytes: total, total })
      await install(text)
      return { installed: true, reason: '' }
    } catch (error: unknown) {
      if (signal.aborted) {
        return { installed: false, reason: 'cancelled; what arrived is kept for next time' }
      }
      controller.abort()
      return { installed: false, reason: reasonOf(error) }
    } finally {
      controller = null
    }
  }

  return {
    source: async () => {
      try {
        const { manifest: found, wanted } = await manifest()
        return {
          available: true,
          id: found.id,
          version: found.version,
          bytes: wanted.reduce((sum, one) => sum + (one.bytes ?? 0), 0),
          files: wanted.length,
        }
      } catch (error: unknown) {
        return { available: false, reason: error instanceof Error ? error.message : String(error) }
      }
    },
    download: (progress) => {
      running ??= run(progress).finally(() => {
        running = null
      })
      return running
    },
    cancel: () => {
      controller?.abort()
    },
  }
}
