import { CopyButton } from './CopyButton'

/** Lines to type, in a dark block with a copy button for all of them at once. */
export function CodeLines({ lines, label }: { lines: readonly string[]; label: string }) {
  return (
    <div className="codeblock copy">
      <code>
        {lines.map((line, i) => (
          <span key={line}>
            {i > 0 && '\n'}
            {line}
          </span>
        ))}
      </code>
      <CopyButton text={lines.join('\n')} label={label} />
    </div>
  )
}
