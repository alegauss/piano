// The Markdown twin, converted from the same render. The copy lives in the content module but
// the composition lives in the JSX, so the twin is produced from the rendered HTML and never
// authored a second time from the data, which would declare the composition twice and let the
// two drift. The nav and the footer never reach a twin (dropped by tag), and a call to action
// is dropped by its data-twin="omit" attribute.
import { parse } from 'node-html-parser'

// Whole subtrees that never belong in a twin.
const SKIP_TAGS = new Set(['NAV', 'FOOTER', 'BUTTON', 'SCRIPT', 'STYLE', 'NOSCRIPT'])
// Decorative chrome dropped by class: the pulse dot, the ticks, the card icons, the step
// numbers, the section kicker, the terminal window bars.
const SKIP_CLASSES = new Set(['dot', 'chk', 'ico', 'n', 'eyebrow', 'bar', 'copy-btn'])
// Elements that carry a run of text rather than a block.
const INLINE_TAGS = new Set(['SPAN', 'B', 'STRONG', 'I', 'EM', 'CODE', 'KBD', 'A', 'BR'])
const HEADING = { H1: '#', H2: '##', H3: '###', H4: '####', H5: '#####', H6: '######' }

function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

const collapse = (s) => s.replace(/\s+/g, ' ')
const classList = (node) => {
  const c = node.getAttribute && node.getAttribute('class')
  return c ? c.split(/\s+/) : []
}

function skipped(node) {
  if (SKIP_TAGS.has(node.rawTagName?.toUpperCase())) return true
  if (node.getAttribute && node.getAttribute('data-twin') === 'omit') return true
  return classList(node).some((c) => SKIP_CLASSES.has(c))
}

// Every text node under a subtree, tags dropped and entities decoded.
function plainText(node) {
  if (node.nodeType === 3) return decode(node.rawText)
  if (node.nodeType !== 1) return ''
  return node.childNodes.map(plainText).join('')
}

// The raw text of a subtree with markup left in place. node-html-parser keeps a <pre>'s whole
// content as one raw text node, colour spans and all, so a fence is cleaned by stripping the
// tags and only then decoding entities: an escaped `&lt;` must survive the strip.
function rawTextAll(node) {
  if (node.nodeType === 3) return node.rawText
  if (node.nodeType !== 1) return ''
  return node.childNodes.map(rawTextAll).join('')
}

function fenced(text) {
  const body = text.replace(/^\n+/, '').replace(/\n+$/, '')
  return '```\n' + body + '\n```'
}

function fencedFrom(node) {
  return fenced(decode(rawTextAll(node).replace(/<[^>]+>/g, '')))
}

// A run with **bold**, *italic*, `code` and [links].
function inline(node) {
  if (node.nodeType === 3) return collapse(decode(node.rawText))
  if (node.nodeType !== 1) return ''
  if (skipped(node)) return ''
  const tag = node.rawTagName.toUpperCase()
  const kids = () => node.childNodes.map(inline).join('')
  switch (tag) {
    case 'CODE':
    case 'KBD':
      return '`' + collapse(plainText(node)) + '`'
    case 'B':
    case 'STRONG': {
      const t = kids().trim()
      return t ? `**${t}**` : ''
    }
    case 'I':
    case 'EM': {
      const t = kids().trim()
      // a lone decorative glyph (the ✗ before a non-goal) carries nothing in a flat file
      if (!t || (t.length <= 2 && !/[a-z0-9]/i.test(t))) return ''
      return `*${t}*`
    }
    case 'BR':
      return ' '
    case 'A': {
      const href = node.getAttribute('href') || ''
      const text = kids().trim()
      if (!text) return ''
      return href && !href.startsWith('#') ? `[${text}](${href})` : text
    }
    case 'SVG':
      return ''
    default:
      return kids()
  }
}

const inlineTrim = (node) => collapse(node.childNodes.map(inline).join('')).trim()

function cellsOf(tr) {
  return tr.childNodes.filter(
    (n) => n.nodeType === 1 && ['TH', 'TD'].includes(n.rawTagName.toUpperCase()),
  )
}

// A cell's text, with the pipe that would otherwise end the cell escaped.
const cell = (c) => inlineTrim(c).replaceAll('|', '\\|') || ' '

// A GitHub-flavoured table, so the twin of a matrix stays machine-readable.
function tableToMarkdown(table) {
  const headTr = table.querySelector('thead tr') ?? table.querySelector('tr')
  const headers = headTr ? cellsOf(headTr).map(cell) : []
  if (headers.length === 0) return ''
  const lines = [`| ${headers.join(' | ')} |`, `| ${headers.map(() => '---').join(' | ')} |`]
  const bodyRows = table.querySelectorAll('tbody tr')
  const rows = bodyRows.length ? bodyRows : table.querySelectorAll('tr').slice(1)
  for (const tr of rows) {
    const row = cellsOf(tr).map(cell)
    while (row.length < headers.length) row.push('')
    lines.push(`| ${row.join(' | ')} |`)
  }
  return lines.join('\n')
}

function blocks(node, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const t = collapse(decode(child.rawText)).trim()
      if (t) out.push(t)
      continue
    }
    if (child.nodeType !== 1 || skipped(child)) continue
    const tag = child.rawTagName.toUpperCase()
    const cls = classList(child)

    if (tag === 'A' && child.querySelector('h1, h2, h3, h4, p')) {
      // A card that is a link holds blocks, and read as one inline run its heading and its
      // description run together. It becomes one list item: the heading as the link.
      const heading = child.querySelector('h1, h2, h3, h4')
      const body = child.querySelector('p')
      const link = `[${heading ? inlineTrim(heading) : inlineTrim(child)}](${child.getAttribute('href')})`
      out.push(`- ${link}${body ? `: ${inlineTrim(body)}` : ''}`)
    } else if (cls.includes('term')) {
      const pre = child.querySelector('pre')
      if (pre) out.push(fencedFrom(pre))
    } else if (cls.includes('codeblock')) {
      const code = child.querySelector('code')
      if (code) out.push(fencedFrom(code))
    } else if (tag === 'PRE') {
      out.push(fencedFrom(child))
    } else if (tag === 'TABLE') {
      const md = tableToMarkdown(child)
      if (md) out.push(md)
    } else if (HEADING[tag]) {
      const t = inlineTrim(child)
      if (t) out.push(`${HEADING[tag]} ${t}`)
    } else if (tag === 'P') {
      const t = inlineTrim(child)
      if (t) out.push(t)
    } else if (tag === 'UL' || tag === 'OL') {
      const items = child
        .querySelectorAll(':scope > li')
        .map((li) => inlineTrim(li))
        .filter(Boolean)
        .map((t) => `- ${t}`)
      if (items.length) out.push(items.join('\n'))
    } else if (tag === 'FIGCAPTION') {
      const t = inlineTrim(child)
      if (t) out.push(`_${t}_`)
    } else if (tag === 'SVG') {
      const label = child.getAttribute('aria-label')
      if (label) out.push(`> _Figure: ${collapse(label).trim()}_`)
    } else if (INLINE_TAGS.has(tag)) {
      // an inline element at block level (a pill, a hero-meta item) is one line, not a tree
      // to recurse and shatter into a paragraph per text node
      const t = inlineTrim(child)
      if (t) out.push(t)
    } else {
      blocks(child, out)
    }
  }
}

export function htmlToMarkdown(html) {
  const root = parse(html, { comment: false })
  const out = []
  blocks(root, out)
  return out.filter((b) => b.trim().length > 0).join('\n\n') + '\n'
}
