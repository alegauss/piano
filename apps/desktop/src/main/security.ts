import { shell, type BrowserWindow, type Session } from 'electron'

/**
 * The renderer holds no privilege, and these are the walls that keep it that
 * way once contextIsolation and the sandbox have done their part.
 *
 * Every rule here is a default-deny. The app loads JSON a model wrote and
 * files a user dragged in, so the question is never "is this page trusted" —
 * it is "what can a page do if it turns out not to be".
 */

/**
 * Dev needs more room than production: Vite injects inline scripts, rewrites
 * styles at runtime and holds a websocket open for hot reload. Production gets
 * the tight policy, and the gap between them is deliberate rather than
 * forgotten.
 */
function contentSecurityPolicy(devServerUrl: string | undefined): string {
  const directives = [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "worker-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
  ]

  if (devServerUrl !== undefined && devServerUrl !== '') {
    const origin = new URL(devServerUrl).origin
    const websocket = origin.replace(/^http/, 'ws')
    directives.push(
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${origin}`,
      `style-src 'self' 'unsafe-inline' ${origin}`,
      `connect-src 'self' ${origin} ${websocket}`,
    )
  } else {
    directives.push(
      "script-src 'self'",
      // Vite emits a stylesheet, but React and the canvas layer set inline
      // styles; 'unsafe-inline' for style only is the usual, narrow exception.
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
    )
  }

  return directives.join('; ')
}

/**
 * Apply the policy as a response header rather than a meta tag: a header
 * cannot be removed by the document it governs.
 */
export function applyContentSecurityPolicy(
  session: Session,
  devServerUrl: string | undefined,
): void {
  const policy = contentSecurityPolicy(devServerUrl)

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    })
  })
}

/**
 * Nothing in this app needs a camera, a microphone, geolocation or
 * notifications. MIDI is the one permission granted, because a practice mode
 * without a keyboard plugged into it is not one.
 *
 * Both names are here, and not by carelessness. Web MIDI asks for plain
 * access and for system-exclusive access separately, but Chromium carries
 * one permission for the pair and Electron hands it over as `midiSysex`
 * whichever the page asked for: granting only `midi` leaves
 * requestMIDIAccess rejecting with nothing in the renderer able to say why.
 * What keeps sysex out of this app is therefore the renderer's own request,
 * which never asks for it, so the ports it holds never deliver it. That is
 * asserted in the self-check rather than assumed here.
 *
 * Both handlers matter too. Electron asks the request handler when a page
 * calls requestMIDIAccess and the check handler when something wants to know
 * whether the permission is already held, and a check handler that says no
 * is the same silent failure by another route.
 */
const GRANTED = new Set<string>(['midi', 'midiSysex'])

export function applyPermissions(session: Session): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(GRANTED.has(permission))
  })
  session.setPermissionCheckHandler((_webContents, permission) => GRANTED.has(permission))
}

/**
 * The window shows this app and never becomes a browser. A link goes to the
 * real browser, where the user can see the address bar.
 */
export function confineNavigation(window: BrowserWindow, allowedOrigin: string | undefined): void {
  const { webContents } = window

  webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  webContents.on('will-navigate', (event, url) => {
    if (isInternal(url, allowedOrigin)) {
      return
    }
    event.preventDefault()
    void shell.openExternal(url)
  })

  // A webview is a second renderer with its own settings; this app has none.
  webContents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

function isInternal(url: string, allowedOrigin: string | undefined): boolean {
  if (url.startsWith('file://')) {
    return true
  }
  if (allowedOrigin === undefined || allowedOrigin === '') {
    return false
  }
  try {
    return new URL(url).origin === new URL(allowedOrigin).origin
  } catch {
    return false
  }
}
