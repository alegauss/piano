import { existsSync } from 'node:fs'
import { basename } from 'node:path'

import type { OpenRequest, OpenResult, RecentEntry } from '@piano/ipc'

import type { Recent } from './recent'
import { libraryPath, type Opened, type Refused } from './score-files'

/**
 * Every way a score is opened, and the one thing they all do.
 *
 * Each source only decides which file: the dialog asks the person, a drop
 * names the file dropped, the recent list names one it already holds, a
 * library id names one inside the library, a launch names what the file
 * manager passed. From there there is one road — the same read, the same
 * validation, the same refusal — and only a score that was accepted reaches
 * the recent list. Nothing here changes what the window has open: it answers,
 * and the window replaces its score only on an answer that says opened.
 */

export type OpenerDeps = {
  /** Read and validate one file. */
  readonly read: (path: string) => Promise<Opened | Refused>
  readonly recent: Recent
  /** Ask the person which file, or null when they closed the dialog. */
  readonly choose: () => Promise<string | null>
  readonly libraryRoot: () => string
  /** What the app was started to open, handed over once and then forgotten. */
  readonly launched: () => string | null
  /** Told when a score joins the recent list, for the menu and the system's own list. */
  readonly remembered?: (entries: readonly RecentEntry[], opened: RecentEntry) => void
  readonly exists?: (path: string) => boolean
}

export type Opener = {
  readonly open: (request: OpenRequest) => Promise<OpenResult>
  /** A file named from outside the page: the file manager, a second launch. */
  readonly openPath: (path: string) => Promise<OpenResult>
}

export function createOpener(deps: OpenerDeps): Opener {
  const exists = deps.exists ?? existsSync

  const openPath = async (path: string): Promise<OpenResult> => {
    const result = await deps.read(path)
    if (result.kind === 'opened') {
      const entry = { path, name: result.name, title: result.score.metadata.title }
      try {
        deps.remembered?.(await deps.recent.add(entry), entry)
      } catch {
        // A list that cannot be written is not a reason to refuse the score.
      }
    }
    return result
  }

  const open = async (request: OpenRequest): Promise<OpenResult> => {
    switch (request.from) {
      case 'dialog': {
        const chosen = await deps.choose()
        return chosen === null ? { kind: 'none' } : openPath(chosen)
      }
      case 'dropped':
        return openPath(request.path)
      case 'recent':
        if (!(await deps.recent.has(request.path))) {
          return notRecent(request.path)
        }
        return openPath(request.path)
      case 'library': {
        const path = libraryPath(deps.libraryRoot(), request.id)
        if (!exists(path)) {
          return {
            kind: 'refused',
            name: request.id,
            message: `No score in the library is called "${request.id}". Save it there first.`,
            problems: [],
          }
        }
        return openPath(path)
      }
      case 'launch': {
        const path = deps.launched()
        return path === null ? { kind: 'none' } : openPath(path)
      }
    }
  }

  return { open, openPath }
}

function notRecent(path: string): Refused {
  const name = basename(path)
  return {
    kind: 'refused',
    name,
    message: `${name} is not on the recent list, so it was not opened. Open it from the dialog instead.`,
    problems: [],
  }
}
