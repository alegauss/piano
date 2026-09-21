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
 * The settings, in the footer: said out loud when some of them could not be
 * read and are at their defaults again, and a way back to every default,
 * which is the quickest way out of an audio setup that went wrong and the
 * alternative to somebody hunting for a file to delete.
 */
export function SettingsStatus({
  notice,
  onDismiss,
  onReset,
}: {
  readonly notice: string | null
  readonly onDismiss: () => void
  /** Every setting back to its default, now and at the next launch. */
  readonly onReset: () => Promise<void>
}) {
  const [asking, setAsking] = useState(false)
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
          Reset settings
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset every setting?</DialogTitle>
            <DialogDescription>
              The keyboard, its calibration, the theme, the level, the roll and how strictly timing
              is judged all go back to how the app first started. Your scores and your practice
              history stay as they are.
            </DialogDescription>
          </DialogHeader>
          {failed === null ? null : <p className="text-sm text-danger">{failed}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Keep them</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                onReset().then(
                  () => {
                    setAsking(false)
                  },
                  (cause: unknown) => {
                    setFailed(
                      `The settings could not be reset: ${cause instanceof Error ? cause.message : String(cause)}`,
                    )
                  },
                )
              }}
            >
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </span>
  )
}
