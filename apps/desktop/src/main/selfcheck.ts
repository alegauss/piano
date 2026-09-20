import { allChannels, windowSetTitle } from '@piano/ipc'
import type { BrowserWindow } from 'electron'

import { unregisteredChannels } from './ipc'
import { secureWebPreferences } from './window-preferences'

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
    check('the bridge is exposed', reachable['piano'] === 'object', `typeof window.piano = ${String(reachable['piano'])}`),
  )

  // 3. Every declared channel has a handler behind it.
  const missing = unregisteredChannels()
  results.push(
    check(
      'every declared channel is registered',
      missing.length === 0,
      missing.length === 0 ? `${String(allChannels.length)} channels` : `missing: ${missing.join(', ')}`,
    ),
  )

  // 4. A well-formed call answers, and its response satisfies the contract.
  const info = await webContents.executeJavaScript('window.piano.appInfo()')
  results.push(
    check(
      'app:info answers with a valid response',
      typeof info === 'object' && info !== null && typeof (info as { electron?: unknown }).electron === 'string',
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

  // 6. And a valid one still works after all that, so validation refused the
  //    payload rather than breaking the channel.
  const accepted = (await webContents.executeJavaScript(
    'window.piano.setWindowTitle({ title: "Piano" }).then(r => r.title, e => "rejected: " + e.message)',
  )) as string
  results.push(check('window:set-title accepts a valid payload', accepted === 'Piano', accepted))

  return results
}
