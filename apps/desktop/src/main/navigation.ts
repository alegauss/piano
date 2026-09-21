/**
 * Which addresses the window may show: its own page, and in development the
 * dev server it is loaded from. Nothing else, and in particular no file other
 * than the page — a score dropped where the page does not catch it arrives as
 * a navigation to that file.
 */
export function isInternal(
  url: string,
  allowedOrigin: string | undefined,
  appPage: string,
): boolean {
  if (url.startsWith('file:')) {
    return withoutFragment(url) === withoutFragment(appPage)
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

/** A page's address without what only moves within it. */
function withoutFragment(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    parsed.search = ''
    return parsed.href
  } catch {
    return url
  }
}
