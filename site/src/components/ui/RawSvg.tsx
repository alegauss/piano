// Renders an illustrative SVG kept as verbatim markup in lib/diagrams.ts. The content is
// static and author-controlled, with no interpolation of anything a reader supplies, so
// dangerouslySetInnerHTML is the faithful way to keep the drawing byte-identical.
export function RawSvg({ markup, className }: { markup: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: markup }} />
}
