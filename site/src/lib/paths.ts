// GitHub Pages derives the base from the repository name: the site is served at
// https://alegauss.github.io/piano/, so the canonical, og:url, the sitemap and every link
// carry it. Written here and in vite.config.ts, and nowhere else. A module of its own, because
// the content, the chrome and the route table all need it and the route table imports the
// other two.
export const SITE_ORIGIN = 'https://alegauss.github.io'
export const BASE = '/piano/'

/** A link to a route from any other route: base-absolute, with the trailing slash the static
 *  file is served under. A "#anchor" suffix is kept. */
export function href(path: string): string {
  const [route, anchor] = path.split('#')
  const base = route === '/' || route === '' ? BASE : `${BASE}${route.replace(/^\//, '')}/`
  return anchor ? `${base}#${anchor}` : base
}

/** A file served from public/, base-prefixed. */
export function asset(name: string): string {
  return `${BASE}${name}`
}
