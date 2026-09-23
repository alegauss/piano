// The prerender. One render per route, the <head> patched by replace-or-throw so a drifted
// template fails the build rather than shipping a page under another route's title. It reads
// the SSR bundle built by `vite build --ssr`, and the route metadata comes from the same table
// routes.tsx has already asserted against the component map, so a route missing from either
// side never reaches this loop.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  BASE,
  OG_IMAGE,
  ROUTE_META,
  canonicalUrl,
  outputDir,
  render,
  renderStatic,
} from '../dist-server/entry-server.js'
import { htmlToMarkdown } from './markdown.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const distDir = join(here, '..', 'dist')
const template = readFileSync(join(distDir, 'index.html'), 'utf8')

/** Replace the one match of `find`, or throw: a missing anchor is a drifted template. */
function replaceOrThrow(html, find, replacement, label) {
  const found = typeof find === 'string' ? html.includes(find) : find.test(html)
  if (!found) {
    throw new Error(`prerender: template no longer contains ${label}`)
  }
  return html.replace(find, replacement)
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

if (ROUTE_META.length === 0) {
  throw new Error('prerender: ROUTE_META is empty, so there is nothing to render')
}

const byteLength = (s) => Buffer.byteLength(s, 'utf8')
const manifestRoutes = []

for (const meta of ROUTE_META) {
  const body = render(meta.path)
  const canonical = canonicalUrl(meta.path)

  let html = template

  html = replaceOrThrow(
    html,
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(meta.title)}</title>`,
    'a <title>',
  )

  html = replaceOrThrow(
    html,
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    'a <meta name="description">',
  )

  const headBlock = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(OG_IMAGE)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${escapeHtml(OG_IMAGE)}" />`,
  ].join('\n    ')
  html = replaceOrThrow(html, '</head>', `  ${headBlock}\n  </head>`, 'a </head>')

  html = replaceOrThrow(
    html,
    '<div id="root"></div>',
    `<div id="root">${body}</div>`,
    'the <div id="root"> mount point',
  )

  // The Markdown twin, converted from the same render.
  const markdown = htmlToMarkdown(renderStatic(meta.path))

  const rel = outputDir(meta.path)
  const dir = join(distDir, rel)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), html)
  writeFileSync(join(dir, 'index.md'), markdown)

  const htmlPath = rel ? `${rel}/index.html` : 'index.html'
  const mdPath = rel ? `${rel}/index.md` : 'index.md'
  manifestRoutes.push({
    path: meta.path,
    url: canonical,
    title: meta.title,
    description: meta.description,
    html: htmlPath,
    markdown: mdPath,
    htmlBytes: byteLength(html),
    markdownBytes: byteLength(markdown),
  })
  console.log(
    `prerendered ${meta.path.padEnd(22)} -> ${htmlPath} + ${mdPath}  (${byteLength(markdown)} md bytes)`,
  )
}

// The routes, their twins and their sizes, so an agent can pick the page it needs before
// paying for it. No build timestamp: the same input builds byte-identical output.
const manifest = {
  name: 'Piano',
  base: BASE,
  llms: 'llms.txt',
  routes: manifestRoutes,
}
writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

/**
 * When the authored site last changed, as YYYY-MM-DD from git.
 *
 * Not the build clock: a rebuild that changed nothing would otherwise tell a crawler that
 * every page did. One date for every route rather than one per route, because knowing which
 * sources compose which page would need either the module graph or a second hand-kept list.
 * One date over the whole authored tree is a weaker claim and a true one.
 */
function lastAuthoredChange() {
  try {
    const stamp = execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', 'src', 'public', 'index.html'],
      { cwd: join(here, '..'), encoding: 'utf8' },
    ).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) {
      return stamp
    }
  } catch {
    // A tarball with no .git, or git not on PATH. A sitemap with no lastmod is valid and
    // says nothing, which beats a date that is a guess.
  }
  return null
}

// robots.txt and sitemap.xml come from the same ROUTE_META the loop walked, so a route that
// exists appears and a deleted one disappears with no second list to keep current.
const lastmod = lastAuthoredChange()
const urls = ROUTE_META.map((meta) => {
  const loc = `    <loc>${escapeHtml(canonicalUrl(meta.path))}</loc>`
  return lastmod
    ? `  <url>\n${loc}\n    <lastmod>${lastmod}</lastmod>\n  </url>`
    : `  <url>\n${loc}\n  </url>`
})

writeFileSync(
  join(distDir, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') +
    '\n</urlset>\n',
)

const sitemapUrl = `${canonicalUrl('/')}sitemap.xml`
writeFileSync(join(distDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`)

console.log(
  `prerender: ${ROUTE_META.length} route(s) + twins + manifest.json` +
    `, sitemap.xml (lastmod ${lastmod ?? 'omitted'}) and robots.txt written to dist/`,
)
