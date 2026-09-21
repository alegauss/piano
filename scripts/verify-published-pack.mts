import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createPackDownloader, packSourceUrl } from '../apps/desktop/src/main/pack-download'

/**
 * Download the sample pack from where the app looks for it, the way the app
 * does, and refuse to call it published until that works.
 *
 * The release workflow runs this after the pack is deployed and before the
 * release is made public, so an installer is never handed out pointing at a
 * folder that is not there, or at one that serves something the app would
 * refuse. It uses the app's own downloader rather than a second opinion about
 * what the app needs: every file is fetched and checked against the manifest's
 * sha256, and the pack is put in place in a folder of its own that is thrown
 * away afterwards.
 *
 * With PIANO_PACK_URL set it checks that folder instead, which is how to try
 * it against a pack served from this machine.
 */

const base = packSourceUrl()
const scratch = await mkdtemp(join(tmpdir(), 'piano-published-pack-'))

try {
  const downloader = createPackDownloader({ base, directory: join(scratch, 'sample-pack') })
  const source = await downloader.source()
  if (!source.available) {
    throw new Error(`nothing downloadable at ${base}: ${source.reason}`)
  }
  const result = await downloader.download(() => {})
  if (!result.installed) {
    throw new Error(`the pack at ${base} did not install: ${result.reason}`)
  }
  const megabytes = (source.bytes / 1024 / 1024).toFixed(1)
  process.stdout.write(
    `published pack: ${source.id} v${String(source.version)}, ${String(source.files)} files, ` +
      `${megabytes} MB, downloads and verifies from ${base}\n`,
  )
} catch (cause: unknown) {
  process.stderr.write(
    `published pack: ${cause instanceof Error ? cause.message : String(cause)}\n`,
  )
  process.exitCode = 1
} finally {
  await rm(scratch, { recursive: true, force: true })
}
