import { plainly, SHOWN_PROBLEMS, type Refusal } from '../lib/open'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

/**
 * What came of opening a file, when there is something to say.
 *
 * A refused file says what it needs and how to fix it, in the words the
 * validator already chose for that, with where in the file kept one click
 * away: a path such as notes.3.pitch is what a model repairing the score
 * reads, and in the way of a person reading it. It also says the piece that
 * was open still is, because that is the question somebody has next.
 *
 * An opened file that had to be guessed at or cut down — a MIDI import, a
 * migrated score — says so here, rather than the window quietly playing
 * something other than what the file held.
 */

export type Report =
  Refusal | { readonly kind: 'notices'; readonly name: string; readonly notices: readonly string[] }

export function OpenReport({
  report,
  open,
  onClose,
}: {
  readonly report: Report | null
  /** What is open now, as the header names it. */
  readonly open: string
  readonly onClose: () => void
}) {
  return (
    <Dialog
      open={report !== null}
      onOpenChange={(showing) => {
        if (!showing) {
          onClose()
        }
      }}
    >
      {report === null ? null : (
        <DialogContent>
          {report.kind === 'refused' ? (
            <Refused report={report} open={open} />
          ) : (
            <Notices name={report.name} notices={report.notices} />
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}

function Refused({ report, open }: { readonly report: Refusal; readonly open: string }) {
  const shown = report.problems.slice(0, SHOWN_PROBLEMS).map(plainly)
  const more = report.problems.length - shown.length
  return (
    <>
      <DialogHeader>
        <DialogTitle>Could not open {report.name}</DialogTitle>
        <DialogDescription>Nothing changed: {open} is still open.</DialogDescription>
      </DialogHeader>
      {shown.length === 0 ? (
        <p className="text-sm text-text-default">{report.message}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3 text-sm text-text-default">
            {shown.map((problem, index) => (
              <li key={`${problem.where}-${String(index)}`}>
                <p>Needs {problem.needs}.</p>
                {problem.fix === null ? null : (
                  <p className="text-text-muted">To fix it: {problem.fix}</p>
                )}
              </li>
            ))}
          </ul>
          {more > 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              And {String(more)} more {more === 1 ? 'problem' : 'problems'}.
            </p>
          ) : null}
          <details className="mt-4 text-xs text-text-muted">
            <summary className="cursor-pointer">Where in the file</summary>
            <ul className="mt-2 flex flex-col gap-1 font-mono">
              {shown.map((problem, index) => (
                <li key={`${problem.where}-${String(index)}`}>
                  {problem.where}: found {problem.found}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </>
  )
}

function Notices({
  name,
  notices,
}: {
  readonly name: string
  readonly notices: readonly string[]
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Opened {name}</DialogTitle>
        <DialogDescription>What changed on the way in:</DialogDescription>
      </DialogHeader>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-text-default">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </>
  )
}
