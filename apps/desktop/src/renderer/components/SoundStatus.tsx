import type { SoundState } from '../lib/sound'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog'

/**
 * What the piano is playing with, in the footer and nowhere more prominent.
 *
 * Loading progress is a count in a line of text, so playing never waits on
 * it. Once a pack is in, its credit is one click away: the recordings are
 * somebody else's work under a licence that asks for attribution, and this
 * is where the app gives it.
 */
export function SoundStatus({ state }: { readonly state: SoundState }) {
  switch (state.kind) {
    case 'starting':
      return <span>Sound: synthesised piano</span>
    case 'synth':
      return <span title={state.reason}>Sound: synthesised piano ({state.reason})</span>
    case 'failed':
      return (
        <span title={state.message}>
          Sound: synthesised piano (the sample pack could not be loaded: {state.message})
        </span>
      )
    case 'sampled': {
      const { credit, loaded, total } = state
      return (
        <span className="inline-flex items-center gap-2">
          <span>
            Sound: {credit.title}
            {loaded < total ? ` (loading ${String(loaded)} of ${String(total)} registers)` : ''}
          </span>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs">
                About the sound
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{credit.title}</DialogTitle>
                <DialogDescription>Recorded by {credit.author}</DialogDescription>
              </DialogHeader>
              <dl className="mt-4 flex flex-col gap-3 text-sm text-text-default">
                <div>
                  <dt className="text-text-muted">Licence</dt>
                  <dd>
                    <a
                      className="text-accent underline"
                      href={credit.licenceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {credit.licence}
                    </a>
                    , its full text in {credit.licenceFile} inside the pack
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Source</dt>
                  <dd>
                    <a
                      className="break-all text-accent underline"
                      href={credit.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {credit.source}
                    </a>
                  </dd>
                </div>
                {credit.notes !== undefined ? (
                  <div>
                    <dt className="text-text-muted">Notes</dt>
                    <dd>{credit.notes}</dd>
                  </div>
                ) : null}
              </dl>
            </DialogContent>
          </Dialog>
        </span>
      )
    }
  }
}
