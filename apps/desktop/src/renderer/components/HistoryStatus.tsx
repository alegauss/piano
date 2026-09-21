import type { HistorySaveResult } from '@piano/ipc'
import { useState } from 'react'

import { Button } from './ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

/**
 * The practice history, in the footer: two plain doors on the one record this
 * app keeps about a person.
 *
 * They are here rather than beside the report because they are about all of
 * it, not the piece that happens to be open, and because this is where
 * somebody looks for the settings' reset — the same question, asked of the
 * other file the app keeps for them. Deleting asks first; saving does not,
 * since a file nobody wanted is deleted in a second.
 */
export function HistoryStatus({
  notice,
  onDismiss,
  onSave,
  onDelete,
}: {
  /** What could not be read or saved, or null. */
  readonly notice: string | null
  readonly onDismiss: () => void
  /** Save it as a file somebody keeps, main asking where. */
  readonly onSave: () => Promise<HistorySaveResult>
  /** Erase it, file and all. */
  readonly onDelete: () => Promise<void>
}) {
  const [asking, setAsking] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {notice === null ? null : (
        <span role="status" className="text-danger">
          {notice}{' '}
          <button type="button" className="underline" onClick={onDismiss}>
            Understood
          </button>
        </span>
      )}
      {said === null ? null : (
        <span role="status" className="text-text-default">
          {said}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-1.5 text-xs"
        onClick={() => {
          setSaid(null)
          onSave().then(
            (result) => {
              if (result.kind === 'saved') {
                setSaid(`Saved as ${result.name}.`)
              } else if (result.kind === 'refused') {
                setSaid(`The practice history was not saved: ${result.message}`)
              }
            },
            (cause: unknown) => {
              setSaid(
                `The practice history was not saved: ${cause instanceof Error ? cause.message : String(cause)}`,
              )
            },
          )
        }}
      >
        Save practice history
      </Button>
      <Dialog open={asking} onOpenChange={setAsking}>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 px-1.5 text-xs"
          onClick={() => {
            setFailed(null)
            setAsking(true)
          }}
        >
          Delete practice history
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete every attempt?</DialogTitle>
            <DialogDescription>
              Every attempt this app has graded goes, and with it what it can say about which bars
              keep failing. Your scores and your settings stay as they are. Save a copy first if you
              want to keep it.
            </DialogDescription>
          </DialogHeader>
          {failed === null ? null : <p className="text-sm text-danger">{failed}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Keep it</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                onDelete().then(
                  () => {
                    setSaid(null)
                    setAsking(false)
                  },
                  (cause: unknown) => {
                    setFailed(
                      `The practice history could not be deleted: ${cause instanceof Error ? cause.message : String(cause)}`,
                    )
                  },
                )
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  )
}
