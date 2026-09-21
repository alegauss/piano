import { execFile, execFileSync, spawn } from 'node:child_process'
import { access, chmod, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  desktopEntry,
  launchServices,
  parseRegQuery,
  report,
  windowsInstalled,
  windowsRemoved,
} from './associations.mjs'

/**
 * Install what was just built and ask the system what it now knows.
 *
 * The associations the piano claims are written by an installer and read by a
 * shell, and nothing between building and somebody double-clicking a file
 * exercises either. So this does: on Windows a silent install into a temporary
 * directory and a read of the registry, then the uninstaller and the same read
 * again; on macOS the app out of the disk image and into Launch Services; on
 * Linux the desktop entry the AppImage carries.
 *
 * It is not part of `npm run package`, and must not become part of it. It
 * installs software and writes to the registry, which is fine on a runner that
 * is thrown away afterwards and rude on the machine somebody is working on.
 * The release workflow calls it after packaging, which is where an installer
 * that does not register what it claims should stop.
 */

const run = promisify(execFile)

const releaseDir = fileURLToPath(new URL('../release', import.meta.url))

const BUNDLE_ID = 'com.alegauss.piano'

/** @param {string} line */
const say = (line) => process.stdout.write(line)

/**
 * The file in the release folder with this extension, preferring the one built
 * for this processor where a platform produces two.
 *
 * @param {string} extension
 * @returns {Promise<string>}
 */
async function artifact(extension) {
  /** @type {string[]} */
  let entries
  try {
    entries = await readdir(releaseDir)
  } catch {
    throw new Error(`nothing at ${releaseDir}; run \`npm run package\` first`)
  }
  const found = entries.filter((name) => name.toLowerCase().endsWith(extension)).sort()
  const chosen = found.find((name) => name.includes(process.arch)) ?? found[0]
  if (chosen === undefined) {
    throw new Error(`no ${extension} in ${releaseDir}; run \`npm run package\` first`)
  }
  return join(releaseDir, chosen)
}

/**
 * Run a program to completion, answering its exit code rather than throwing:
 * an installer that refuses is a finding, not a crash.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ verbatim?: boolean }} [options]
 * @returns {Promise<number>}
 */
function started(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...(options.verbatim === true ? { windowsVerbatimArguments: true } : {}),
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      resolve(code ?? 1)
    })
  })
}

/**
 * One key of the registry as text, or null where there is no such key.
 *
 * @param {string} key
 * @returns {string | null}
 */
function readKey(key) {
  try {
    return String(execFileSync('reg', ['query', key], { encoding: 'utf8', stdio: 'pipe' }))
  } catch {
    return null
  }
}

/**
 * A reader over `reg query`, reading each key once. A fresh one is made after
 * the uninstall, since the point of that read is what changed.
 *
 * @returns {import('./associations.mjs').ReadRegistry}
 */
function registry() {
  /** @type {Map<string, string | null>} */
  const cache = new Map()
  return (key, value) => {
    if (!cache.has(key)) {
      cache.set(key, readKey(key))
    }
    const output = cache.get(key) ?? null
    return output === null ? null : parseRegQuery(output, value)
  }
}

/** @returns {Promise<boolean>} */
async function onWindows() {
  const installer = await artifact('.exe')
  const target = await mkdtemp(join(tmpdir(), 'piano-associations-'))
  const exe = join(target, 'Piano.exe')

  try {
    // NSIS takes the directory unquoted, as the last argument and to the end
    // of the line, so node must not quote it for us.
    const code = await started(installer, ['/S', `/D=${target}`], { verbatim: true })
    if (code !== 0) {
      process.stderr.write(`associations: the installer exited ${String(code)}\n`)
      return false
    }
    await access(exe)

    let ok = report('windows', windowsInstalled(registry(), exe), say)

    const uninstaller = (await readdir(target)).find((name) => /^Uninstall .*\.exe$/.test(name))
    if (uninstaller === undefined) {
      process.stderr.write(`associations: no uninstaller in ${target}\n`)
      return false
    }
    // `_?=` keeps the uninstaller in place, so it finishes before this reads
    // the registry again instead of copying itself away and returning at once.
    await started(join(target, uninstaller), ['/S', `_?=${target}`], { verbatim: true })

    ok = report('windows', windowsRemoved(registry()), say) && ok
    return ok
  } finally {
    await rm(target, { recursive: true, force: true })
  }
}

/** @returns {Promise<boolean>} */
async function onMac() {
  const image = await artifact('.dmg')
  const work = await mkdtemp(join(tmpdir(), 'piano-associations-'))
  const mount = join(work, 'mnt')
  const copied = join(work, 'Piano.app')
  const lsregister =
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'

  try {
    await run('hdiutil', ['attach', image, '-nobrowse', '-readonly', '-mountpoint', mount])
    try {
      // Out of the image and onto the disk, which is what a person does with
      // it and the only state Launch Services will register.
      await run('cp', ['-R', join(mount, 'Piano.app'), copied])
    } finally {
      await run('hdiutil', ['detach', mount, '-force'])
    }

    await run(lsregister, ['-f', copied])
    const { stdout } = await run(lsregister, ['-dump'], { maxBuffer: 64 * 1024 * 1024 })
    const ok = report('macos', launchServices(stdout, BUNDLE_ID), say)
    await run(lsregister, ['-u', copied])
    return ok
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** @returns {Promise<boolean>} */
async function onLinux() {
  const image = await artifact('.appimage')
  const work = await mkdtemp(join(tmpdir(), 'piano-associations-'))

  try {
    await chmod(image, 0o755)
    // Extracting rather than mounting: a runner has no FUSE, and the entry is
    // a file inside the image either way.
    await run(image, ['--appimage-extract'], { cwd: work })
    const root = join(work, 'squashfs-root')
    const found = (await readdir(root)).find((name) => name.endsWith('.desktop'))
    if (found === undefined) {
      process.stderr.write(`associations: no desktop entry in ${root}\n`)
      return false
    }
    const entry = join(root, found)
    let ok = report('linux', desktopEntry(await readFile(entry, 'utf8')), say)

    // The system's own reader, where the runner has it: it knows the rules of
    // the format, which this does not and should not learn.
    try {
      await run('desktop-file-validate', [entry])
      say('pass  linux: desktop-file-validate accepts the entry\n')
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error)
      if (said.includes('ENOENT')) {
        say('note  linux: desktop-file-validate is not installed here\n')
      } else {
        say(`FAIL  linux: desktop-file-validate refuses the entry\n${said}\n`)
        ok = false
      }
    }
    return ok
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** @type {Partial<Record<NodeJS.Platform, () => Promise<boolean>>>} */
const CHECKS = { win32: onWindows, darwin: onMac, linux: onLinux }

const check = CHECKS[process.platform]

if (check === undefined) {
  process.stderr.write(`associations: nothing to check on ${process.platform}\n`)
  process.exit(1)
}

try {
  if (await check()) {
    say('associations: the installed app registers what it claims\n')
  } else {
    process.stderr.write(
      'associations: the installer did not register what the packaging claims.\n' +
        'What is above is what the system said when it was asked.\n',
    )
    process.exit(1)
  }
} catch (error) {
  process.stderr.write(`associations: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
