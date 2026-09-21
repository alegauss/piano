import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { allChannels, windowSetTitle } from '@piano/ipc'
import type { BrowserWindow } from 'electron'

import { unregisteredChannels } from './ipc'
import { secureWebPreferences, windowIcon } from './window-preferences'

/**
 * The checks that can only be run inside a real Electron process.
 *
 * Whether the renderer can reach `require` is not a question a unit test can
 * answer: it depends on the sandbox, on contextIsolation and on what the
 * preload exposed, none of which exist outside a running app. So this runs in
 * main, drives the live renderer, and prints a verdict a script can read.
 *
 * Loaded only when PIANO_SELFCHECK is set, so the normal path never touches it.
 */

export type CheckResult = {
  readonly name: string
  readonly ok: boolean
  readonly detail: string
}

function check(name: string, ok: boolean, detail: string): CheckResult {
  return { name, ok, detail }
}

/** What the renderer can see of the host. Everything but the bridge must be gone. */
const PROBE = `(() => {
  const seen = (name) => {
    try { return typeof globalThis[name] } catch { return 'throws' }
  }
  return {
    require: seen('require'),
    process: seen('process'),
    module: seen('module'),
    global: seen('global'),
    Buffer: seen('Buffer'),
    piano: seen('piano'),
  }
})()`

export async function runSelfCheck(window: BrowserWindow): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const { webContents } = window

  // 1. The object the window was built from says what it should. Electron no
  //    longer exposes the resolved preferences of a live WebContents, so this
  //    asserts the source and step 2 asserts the effect.
  const prefs = secureWebPreferences
  results.push(
    check(
      'webPreferences are locked down',
      prefs.contextIsolation && !prefs.nodeIntegration && prefs.sandbox && prefs.webSecurity,
      `contextIsolation=${String(prefs.contextIsolation)} nodeIntegration=${String(prefs.nodeIntegration)} sandbox=${String(prefs.sandbox)} webSecurity=${String(prefs.webSecurity)}`,
    ),
  )

  // 2. What the page can actually reach, asked of the page itself.
  const reachable = (await webContents.executeJavaScript(PROBE)) as Record<string, string>
  const leaked = ['require', 'process', 'module', 'global', 'Buffer'].filter(
    (name) => reachable[name] !== 'undefined',
  )
  results.push(
    check(
      'the renderer cannot reach require, process or fs',
      leaked.length === 0,
      leaked.length === 0 ? 'all undefined' : `reachable: ${leaked.join(', ')}`,
    ),
  )
  results.push(
    check(
      'the bridge is exposed',
      reachable['piano'] === 'object',
      `typeof window.piano = ${String(reachable['piano'])}`,
    ),
  )

  // 3. Every declared channel has a handler behind it.
  const missing = unregisteredChannels()
  results.push(
    check(
      'every declared channel is registered',
      missing.length === 0,
      missing.length === 0
        ? `${String(allChannels.length)} channels`
        : `missing: ${missing.join(', ')}`,
    ),
  )

  // 4. A well-formed call answers, and its response satisfies the contract.
  const info: unknown = await webContents.executeJavaScript('window.piano.appInfo()')
  results.push(
    check(
      'app:info answers with a valid response',
      typeof info === 'object' &&
        info !== null &&
        typeof (info as { electron?: unknown }).electron === 'string',
      JSON.stringify(info),
    ),
  )

  // 5. A malformed payload is refused, as a rejection carrying a readable
  //    reason, and the main process is still standing afterwards.
  for (const bad of ['{ title: 123 }', '{}', 'null', '{ title: "" }']) {
    const outcome = (await webContents.executeJavaScript(
      `window.piano.setWindowTitle(${bad}).then(() => ({ rejected: false, message: '' }), (e) => ({ rejected: true, message: String(e && e.message || e) }))`,
    )) as { rejected: boolean; message: string }

    const namesTheChannel = outcome.message.includes(windowSetTitle.channel)
    const namesTheField = outcome.message.includes('title') || outcome.message.includes('<root>')
    results.push(
      check(
        `window:set-title refuses ${bad}`,
        outcome.rejected && namesTheChannel && namesTheField,
        outcome.rejected ? outcome.message : 'resolved instead of rejecting',
      ),
    )
  }

  // 6. Both themes are real, and one switch restyles the chrome and the canvas
  //    together. Asked of the live document, because the claim is about what
  //    getComputedStyle resolves, not about what the stylesheet says.
  const themes = (await webContents.executeJavaScript(`(() => {
    const root = document.documentElement
    const was = root.dataset.theme
    const read = () => {
      const s = getComputedStyle(root)
      const body = getComputedStyle(document.body)
      return {
        chrome: body.backgroundColor,
        text: body.color,
        roll: s.getPropertyValue('--roll-background').trim(),
        note: s.getPropertyValue('--note-part-1').trim(),
      }
    }
    root.dataset.theme = 'dark'
    const dark = read()
    root.dataset.theme = 'light'
    const light = read()
    root.dataset.theme = was || 'dark'
    return { dark, light }
  })()`)) as {
    dark: Record<string, string>
    light: Record<string, string>
  }

  const changed = Object.keys(themes.dark).filter((key) => themes.dark[key] !== themes.light[key])
  results.push(
    check(
      'both themes restyle the chrome and the canvas together',
      changed.length === Object.keys(themes.dark).length,
      `changed: ${changed.join(', ') || 'nothing'} (dark roll ${String(themes.dark['roll'])}, light roll ${String(themes.light['roll'])})`,
    ),
  )
  results.push(
    check(
      'no token resolves to nothing in either theme',
      Object.values(themes.dark).every((v) => v !== '') &&
        Object.values(themes.light).every((v) => v !== ''),
      `${JSON.stringify(themes.light)}`,
    ),
  )

  // 7. And a valid one still works after all that, so validation refused the
  //    payload rather than breaking the channel.
  const accepted = (await webContents.executeJavaScript(
    'window.piano.setWindowTitle({ title: "Piano" }).then(r => r.title, e => "rejected: " + e.message)',
  )) as string
  results.push(check('window:set-title accepts a valid payload', accepted === 'Piano', accepted))

  // 8. The sample pack reaches the renderer one listed file at a time, and
  //    nothing else does: not a climb out of the pack, not a file it does not
  //    name. Whether a pack is installed depends on the machine, so the check
  //    that a real recording arrives runs only where one is.
  const pack = (await webContents.executeJavaScript(
    `window.piano.packManifest().then(async (r) => r.installed
      ? { installed: true, bytes: (await window.piano.packFile({ path: r.manifest.samples[0].file })).bytes.length }
      : { installed: false, location: r.location }, (e) => ({ error: String(e && e.message || e) }))`,
  )) as { installed?: boolean; bytes?: number; location?: string; error?: string }
  results.push(
    check(
      'pack:manifest answers, and a listed recording arrives where a pack is installed',
      pack.error === undefined && (pack.installed === false || (pack.bytes ?? 0) > 0),
      JSON.stringify(pack),
    ),
  )
  for (const path of ['../../package.json', 'samples/not-a-recording.ogg']) {
    const outcome = (await webContents.executeJavaScript(
      `window.piano.packFile({ path: ${JSON.stringify(path)} }).then(() => ({ rejected: false, message: '' }), (e) => ({ rejected: true, message: String(e && e.message || e) }))`,
    )) as { rejected: boolean; message: string }
    results.push(
      check(
        `pack:file refuses ${path}`,
        outcome.rejected && outcome.message.includes('pack:file'),
        outcome.rejected ? outcome.message : 'resolved instead of rejecting',
      ),
    )
  }

  // 9. MIDI is the one permission granted, and the renderer really gets it.
  //    Web MIDI fails silently when the handler is missing — requestMIDIAccess
  //    just rejects — so the only honest check is to ask the page.
  const midi = (await webContents.executeJavaScript(
    `navigator.requestMIDIAccess().then(() => ({ granted: true, message: '' }), (e) => ({ granted: false, message: String(e && e.message || e) }))`,
  )) as { granted: boolean; message: string }
  results.push(
    check(
      'the renderer is granted MIDI',
      midi.granted,
      midi.granted ? 'requestMIDIAccess resolved' : midi.message,
    ),
  )
  // Chromium carries one permission for MIDI and for system-exclusive MIDI,
  // so the gate cannot separate them. What keeps sysex out is that the app
  // never asks for it, and an access granted without it cannot send one.
  const plain = (await webContents.executeJavaScript(
    `navigator.requestMIDIAccess().then((a) => ({ sysex: a.sysexEnabled }), (e) => ({ error: String(e && e.message || e) }))`,
  )) as { sysex?: boolean; error?: string }
  results.push(
    check('the access it asks for carries no sysex', plain.sysex === false, JSON.stringify(plain)),
  )
  const camera = (await webContents.executeJavaScript(
    `navigator.mediaDevices.getUserMedia({ video: true }).then(() => ({ refused: false }), () => ({ refused: true }))`,
  )) as { refused: boolean }
  results.push(
    check(
      'a camera is still refused',
      camera.refused,
      camera.refused ? 'rejected' : 'resolved, which it should not',
    ),
  )

  // 10. The window has this app's icon rather than Electron's. Development
  //     has no executable to take one from, so the file has to resolve.
  const icon = windowIcon()
  results.push(
    check(
      'the window is given the app icon',
      icon !== undefined && existsSync(icon),
      icon ?? 'build/icon.png was not found; run npm run icon',
    ),
  )

  // 11. Where a pack is installed, the renderer decodes it: the footer's count
  //    of loaded registers leaves zero. This is the check that Chromium in
  //    this Electron plays what the pack pipeline encodes.
  if (pack.installed === true) {
    const footer = (await webContents.executeJavaScript(`new Promise((resolve) => {
      const started = Date.now()
      const look = () => {
        const line = [...document.querySelectorAll('footer span')]
          .map((span) => span.textContent || '')
          .find((text) => text.startsWith('Sound:')) || ''
        const decoded = line.includes('Sound: ') && !line.includes('synthesised') && !/loading 0 of/.test(line)
        if (decoded || Date.now() - started > 15000) resolve(line)
        else setTimeout(look, 200)
      }
      look()
    })`)) as string
    results.push(
      check(
        'the installed pack decodes in the renderer',
        !footer.includes('synthesised') && !/loading 0 of/.test(footer) && footer !== '',
        footer,
      ),
    )
  }

  return results
}

/**
 * Capture the window under both themes.
 *
 * "Renders correctly" is a visual claim, and nothing above can make it: a
 * control that is the right colour and the wrong size passes every assertion
 * here. So the run leaves two images a person can look at.
 */
export async function captureThemes(window: BrowserWindow, directory: string): Promise<string[]> {
  await mkdir(directory, { recursive: true })

  const written: string[] = []
  for (const theme of ['dark', 'light'] as const) {
    await window.webContents.executeJavaScript(
      `document.documentElement.dataset.theme = ${JSON.stringify(theme)}`,
    )
    // One frame for the new custom properties to resolve and paint.
    await new Promise((resolve) => setTimeout(resolve, 250))
    const image = await window.webContents.capturePage()
    const file = join(directory, `gallery-${theme}.png`)
    await writeFile(file, image.toPNG())
    written.push(file)
  }
  return written
}
