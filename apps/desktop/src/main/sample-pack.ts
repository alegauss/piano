import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

import type { PackManifestResponse } from '@piano/ipc'
import { parseManifest, SALAMANDER } from '@piano/sample-pack'
import { app } from 'electron'

/**
 * The installed sample pack, as main hands it to the renderer.
 *
 * The renderer is sandboxed and reads no disk, so the pack crosses the
 * bridge one named file at a time, and main hands over only files the pack's
 * own manifest lists, from inside the pack's directory. A request for
 * anything else is refused, whatever path it spells.
 */

/**
 * Where to look for a pack.
 *
 * PIANO_SAMPLE_PACK names a directory outright: the manual drop for a machine
 * that cannot download (PI54), and a way to try another pack. Otherwise a
 * development run uses the pack `npm run pack:samples` builds in the
 * repository, and an installed app looks in its user data, where the
 * first-run download will put one.
 */
export function packDirectory(): string {
  const named = process.env['PIANO_SAMPLE_PACK']
  if (named !== undefined && named !== '') {
    return resolve(named)
  }
  if (!app.isPackaged) {
    // dist/main is four levels below the repository root.
    const built = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'packages',
      'sample-pack',
      'out',
      `${SALAMANDER.id}-${String(SALAMANDER.version)}`,
    )
    if (existsSync(join(built, 'manifest.json'))) {
      return built
    }
  }
  return join(app.getPath('userData'), 'sample-pack')
}

export async function readPackManifest(directory: string): Promise<PackManifestResponse> {
  let text: string
  try {
    text = await readFile(join(directory, 'manifest.json'), 'utf8')
  } catch {
    return { installed: false, location: directory }
  }
  try {
    return { installed: true, manifest: JSON.parse(text) as unknown }
  } catch {
    throw new Error(`pack:manifest: the manifest in ${directory} is not JSON`)
  }
}

/** The files each pack directory's manifest lists, read once per directory. */
const listings = new Map<string, Promise<ReadonlySet<string>>>()

function listedFiles(directory: string): Promise<ReadonlySet<string>> {
  let listing = listings.get(directory)
  if (listing === undefined) {
    listing = readFile(join(directory, 'manifest.json'), 'utf8')
      .catch(() => {
        throw new Error(`pack:file: no sample pack is installed in ${directory}`)
      })
      .then((text) => {
        const checked = parseManifest(JSON.parse(text) as unknown)
        if (!checked.ok) {
          throw new Error(`the sample pack's manifest cannot be used: ${checked.problems[0] ?? ''}`)
        }
        return new Set([
          ...checked.manifest.samples.map((sample) => sample.file),
          ...(checked.manifest.releases?.samples ?? []).map((release) => release.file),
        ])
      })
    // A failure is not remembered: a pack being written right now may be
    // whole a moment later.
    void listing.catch(() => listings.delete(directory))
    listings.set(directory, listing)
  }
  return listing
}

export async function readPackFile(
  directory: string,
  path: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const listed = await listedFiles(directory)
  if (!listed.has(path)) {
    throw new Error(`pack:file: ${path} is not a recording the installed pack lists`)
  }
  const root = resolve(directory)
  const file = resolve(root, path)
  const inside = relative(root, file)
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`pack:file: ${path} is outside the pack`)
  }
  // Its own buffer, rather than a view into a pooled one that holds other files too.
  return new Uint8Array(await readFile(file))
}
