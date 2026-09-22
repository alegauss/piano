import type { LibrarySaveResult } from '@piano/ipc'

import { clock } from './LibraryPanel'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'

/**
 * Two pieces, one name.
 *
 * A score is filed under the id its metadata gives it, and an import's is
 * whatever a track name or a file name happened to say — often Untitled, or
 * the composer's surname. So two unrelated downloads can want the same place
 * in the library, and the one that arrives second would replace the first with
 * nothing on screen to show for it.
 *
 * What is already there is described rather than named, because the choice is
 * between two pieces and not between two ids: the title, the composer where
 * there is one, and how long it lasts are what tell somebody whether this is
 * the same piece again or a different one. Neither answer is the default, and
 * closing the dialog files nothing.
 */

export type Clash = Extract<LibrarySaveResult, { kind: 'taken' }>

export function LibraryClash({
  clash,
  onChoose,
  onClose,
}: {
  readonly clash: Clash | null
  readonly onChoose: (choice: 'beside' | 'replace') => void
  readonly onClose: () => void
}) {
  return (
    <Dialog
      open={clash !== null}
      onOpenChange={(showing) => {
        if (!showing) {
          onClose()
        }
      }}
    >
      {clash === null ? null : (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>The library already has a {clash.id}</DialogTitle>
            <DialogDescription>Nothing has been filed yet.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-text-default">
            {[clash.held.title, clash.held.composer, clock(clash.held.seconds)]
              .filter((part) => part !== undefined)
              .join(' · ')}
          </p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onChoose('beside')
              }}
            >
              File this one beside it
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onChoose('replace')
              }}
            >
              Replace what is there
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
