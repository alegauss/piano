import { storedHistory, type HistorySaveResult, type PracticeRecord } from '@piano/ipc'

/**
 * Handing the practice history over as a file.
 *
 * It is a record about a person, kept in a profile folder they did not choose
 * and would have to be told about to find, so the app owes them a plain way to
 * take a copy. The file is the same shape the app itself keeps — version and
 * records — because the point is that somebody can read it, and a second shape
 * invented for the copy would be one more thing to explain.
 *
 * Saving is not the export the recording non-goal rules out: that is about
 * sound. This is a person's own attempts, in JSON, going nowhere but a folder
 * they picked.
 */

export type HistorySaveDeps = {
  /** Ask where to save, suggesting a name; null when the person closed the dialog. */
  readonly choose: (suggested: string) => Promise<string | null>
  readonly write: (path: string, text: string) => Promise<void>
}

/** The name a copy is suggested under: dated, so last month's copy is not overwritten. */
export function historyFileName(at: Date): string {
  const part = (value: number) => String(value).padStart(2, '0')
  const day = `${String(at.getFullYear())}-${part(at.getMonth() + 1)}-${part(at.getDate())}`
  return `piano-practice-${day}.json`
}

export async function saveHistory(
  records: readonly PracticeRecord[],
  deps: HistorySaveDeps,
  now: () => Date = () => new Date(),
): Promise<HistorySaveResult> {
  const path = await deps.choose(historyFileName(now()))
  if (path === null) {
    return { kind: 'cancelled' }
  }
  try {
    await deps.write(path, `${JSON.stringify(storedHistory(records), null, 2)}\n`)
  } catch (error: unknown) {
    return {
      kind: 'refused',
      message: `the file could not be written: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const name = path.split(/[\\/]/).at(-1) ?? path
  return { kind: 'saved', name }
}
