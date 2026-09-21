import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import {
  DEFAULT_TRIM,
  gainToPeak,
  groupOpcode,
  MANIFEST_FORMAT,
  parseDefines,
  parseManifest,
  parseRegions,
  parseVelocityLayers,
  peakOf,
  planReleases,
  planSamples,
  SALAMANDER,
  secondsOf,
  trim,
  withGain,
  type PackSample,
  type Pcm,
  type ReleaseSample,
} from '@piano/sample-pack'

/**
 * Build the piano sample pack from scratch: `npm run pack:samples`.
 *
 * Fetches the library at a pinned commit, checks every file against
 * sources.lock.json, decodes each recording, trims it, normalises the whole
 * set by one gain, encodes to Opus and writes the manifest and the licence
 * beside the recordings. Users never run this; it produces the versioned
 * artifact the build and the first-run download point at.
 *
 * `--lock` records the checksums of what was fetched instead of checking
 * them: run once when the pin or the kept layers change, and commit the lock.
 * Downloads are cached under .cache/, keyed by commit, so a rerun is offline.
 * Needs ffmpeg with libopus on PATH.
 */

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const cacheRoot = join(packageRoot, '.cache', SALAMANDER.commit)
const lockPath = join(packageRoot, 'sources.lock.json')
const outRoot = join(packageRoot, 'out', `${SALAMANDER.id}-${String(SALAMANDER.version)}`)

const SAMPLE_RATE = 48_000
const CHANNELS = 2
/** Transparent for a piano at this rate; a quarter of what the FLAC costs, or less. */
const BITRATE = '96k'
const PARALLEL = 4

const { values } = parseArgs({ options: { lock: { type: 'boolean', default: false } } })
const writingLock = values.lock

type Lock = {
  readonly repository: string
  readonly commit: string
  readonly files: Record<string, string>
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function rawUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/')
  return `https://raw.githubusercontent.com/${SALAMANDER.repository}/${SALAMANDER.commit}/${encoded}`
}

async function readLock(): Promise<Lock> {
  let text: string
  try {
    text = await readFile(lockPath, 'utf8')
  } catch {
    throw new Error('sources.lock.json is missing; run once with --lock to record what is fetched')
  }
  const lock = JSON.parse(text) as Lock
  if (lock.commit !== SALAMANDER.commit || lock.repository !== SALAMANDER.repository) {
    throw new Error(
      `sources.lock.json pins ${lock.repository}@${lock.commit}, but the pack is built from ${SALAMANDER.repository}@${SALAMANDER.commit}; run with --lock`,
    )
  }
  return lock
}

async function download(url: string): Promise<Uint8Array> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`${String(response.status)} ${response.statusText}`)
      }
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`could not fetch ${url}: ${String(lastError)}`)
}

/** A file from the pinned library, from the cache when it is there, always checked. */
async function source(path: string, lock: Lock | null, recorded: Lock): Promise<Uint8Array> {
  const cached = join(cacheRoot, path)
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await readFile(cached))
  } catch {
    bytes = await download(rawUrl(path))
    await mkdir(dirname(cached), { recursive: true })
    await writeFile(cached, bytes)
  }

  const digest = sha256(bytes)
  recorded.files[path] = digest
  if (lock !== null) {
    const expected = lock.files[path]
    if (expected === undefined) {
      throw new Error(`${path} is not in sources.lock.json; run with --lock if it should be`)
    }
    if (expected !== digest) {
      await rm(cached, { force: true })
      throw new Error(`${path} does not match sources.lock.json; the cached copy was removed`)
    }
  }
  return bytes
}

function run(command: string, args: readonly string[], input?: Uint8Array): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(out))
      } else {
        const message = Buffer.concat(err).toString('utf8').trim().split('\n').slice(-3).join('\n')
        reject(new Error(`${command} exited with ${String(code)}: ${message}`))
      }
    })
    child.stdin.on('error', () => {
      // The process exiting early is reported by 'close'; a broken pipe adds nothing.
    })
    child.stdin.end(input)
  })
}

async function decode(bytes: Uint8Array): Promise<Pcm> {
  const raw = await run(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0'].concat(
      ['-f', 'f32le', '-acodec', 'pcm_f32le'],
      ['-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE), 'pipe:1'],
    ),
    bytes,
  )
  // Copied rather than viewed, because a Buffer's offset need not be a
  // multiple of four and a Float32Array's must be.
  const aligned = new Uint8Array(raw)
  return {
    data: new Float32Array(aligned.buffer, 0, Math.floor(aligned.byteLength / 4)),
    channels: CHANNELS,
    sampleRate: SAMPLE_RATE,
  }
}

async function encode(pcm: Pcm): Promise<Buffer> {
  const input = new Uint8Array(pcm.data.buffer, pcm.data.byteOffset, pcm.data.byteLength)
  return run(
    'ffmpeg',
    ['-hide_banner', '-loglevel', 'error'].concat(
      ['-f', 'f32le', '-ar', String(SAMPLE_RATE), '-ac', String(CHANNELS), '-i', 'pipe:0'],
      ['-c:a', 'libopus', '-b:a', BITRATE, '-vbr', 'on', '-application', 'audio'],
      // Bit-exact, so the same sources build the same bytes: without it the
      // Ogg stream serial is random and every rebuild changes every checksum.
      ['-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1'],
      ['-f', 'ogg', 'pipe:1'],
    ),
    input,
  )
}

/** Run `work` over every item, a few at a time, in order of the answers. */
async function inParallel<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item !== undefined) {
        results[index] = await work(item)
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  return results
}

async function main(): Promise<void> {
  await run('ffmpeg', ['-hide_banner', '-version']).catch(() => {
    throw new Error('ffmpeg is needed on PATH to build the pack, with libopus')
  })

  const lock = writingLock ? null : await readLock()
  const recorded: Lock = {
    repository: SALAMANDER.repository,
    commit: SALAMANDER.commit,
    files: {},
  }
  const text = async (path: string) => new TextDecoder().decode(await source(path, lock, recorded))

  const regions = parseRegions(await text(SALAMANDER.regionFile))
  const layers = parseVelocityLayers(await text(SALAMANDER.layerFile))
  const tuning = parseDefines(await text(SALAMANDER.tuningFile))
  const licence = await text(SALAMANDER.licenceFile)
  const releaseMap = await text(SALAMANDER.releaseFile)
  const plan = planSamples(regions, layers, SALAMANDER.layers, tuning)
  const releasePlan = planReleases(parseRegions(releaseMap))
  process.stdout.write(
    `sample pack: ${String(plan.length)} recordings and ${String(releasePlan.length)} key releases to fetch and encode\n`,
  )

  // First pass: the loudest peak in the whole set, which is what one gain
  // normalises to, so the layers and the releases keep their loudness
  // relative to each other and to the library's own mapping.
  const trimmed = (planned: { readonly source: string }) =>
    source(planned.source, lock, recorded)
      .then(decode)
      .then((pcm) => trim(pcm, DEFAULT_TRIM))
  const everything = [...plan, ...releasePlan]
  const peaks = await inParallel(everything, async (planned) => peakOf(await trimmed(planned)))
  const gain = gainToPeak(Math.max(...peaks), -1)

  // Second pass: decoded again rather than held, since the whole set decoded
  // runs to hundreds of megabytes.
  await rm(outRoot, { recursive: true, force: true })
  await mkdir(join(outRoot, 'samples'), { recursive: true })
  await mkdir(join(outRoot, 'releases'), { recursive: true })
  const encodeInto = async (planned: { readonly source: string; readonly file: string }) => {
    const pcm = withGain(await trimmed(planned), gain)
    const bytes = await encode(pcm)
    await writeFile(join(outRoot, planned.file), bytes)
    return {
      seconds: Math.round(secondsOf(pcm) * 1000) / 1000,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    }
  }
  const samples = await inParallel(plan, async (planned): Promise<PackSample> => {
    const { source: _source, ...described } = planned
    return { ...described, ...(await encodeInto(planned)) }
  })
  const releaseSamples = await inParallel(releasePlan, async (planned): Promise<ReleaseSample> => ({
    file: planned.file,
    key: planned.key,
    ...(await encodeInto(planned)),
  }))

  const checked = parseManifest({
    format: MANIFEST_FORMAT,
    id: SALAMANDER.id,
    version: SALAMANDER.version,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    credit: SALAMANDER.credit,
    samples,
    releases: {
      // The library's own settings for these recordings: how quiet, how much
      // they follow velocity, and how much quieter after a long-held key.
      gainDb: groupOpcode(releaseMap, 'volume') ?? 0,
      velocityTracking: (groupOpcode(releaseMap, 'amp_veltrack') ?? 100) / 100,
      decayDbPerSecond: groupOpcode(releaseMap, 'rt_decay') ?? 0,
      samples: releaseSamples,
    },
  })
  if (!checked.ok) {
    throw new Error(`the manifest does not hold together:\n${checked.problems.join('\n')}`)
  }
  await writeFile(join(outRoot, 'manifest.json'), `${JSON.stringify(checked.manifest, null, 2)}\n`)
  await writeFile(join(outRoot, SALAMANDER.credit.licenceFile), licence)

  if (writingLock) {
    const files = Object.fromEntries(
      Object.entries(recorded.files).sort(([a], [b]) => a.localeCompare(b)),
    )
    await writeFile(lockPath, `${JSON.stringify({ ...recorded, files }, null, 2)}\n`)
    process.stdout.write(`sample pack: recorded ${String(Object.keys(files).length)} checksums\n`)
  }

  const bytes = [...samples, ...releaseSamples].reduce((sum, sample) => sum + sample.bytes, 0)
  process.stdout.write(
    `sample pack: ${String(samples.length)} recordings and ${String(releaseSamples.length)} key releases, ${(bytes / 1e6).toFixed(1)} MB, in ${outRoot}\n`,
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`sample pack: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
