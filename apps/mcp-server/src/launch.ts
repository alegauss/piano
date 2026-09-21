import { APP_RECORD, appRecordSchema } from '@piano/ipc'

/**
 * Starting the app somebody installed, from a tool call.
 *
 * The ordinary case is a person in a chat window with the app not running,
 * and "open the app first" turns the premise into a demo. So a request for
 * music that finds no window can start one. The app is looked for where it is
 * known to be, in the order that is most likely right: where somebody said it
 * is, then where the app itself recorded it last ran — which follows any
 * install directory they chose — then where the installer puts it by default.
 * A development checkout is never among them; it is somebody working on the
 * piano, not somebody who installed it.
 */

export type Place = {
  readonly platform: string
  readonly home: string
  readonly env: Readonly<Record<string, string | undefined>>
  readonly exists: (path: string) => boolean
  /** A small text file's contents, or null when it is not there. */
  readonly read: (path: string) => string | null
}

export type Candidate = {
  readonly path: string
  /** Why this place was tried, for a message that has to say where it looked. */
  readonly from: string
}

export type Found = {
  readonly command: string
  readonly args: readonly string[]
  readonly from: string
}

/** Where the app might be, most believable first. */
export function candidates(place: Place): Candidate[] {
  const found: Candidate[] = []
  const named = place.env['PIANO_APP']
  if (named !== undefined && named.trim() !== '') {
    found.push({ path: named, from: 'PIANO_APP' })
  }

  const recordText = place.read(`${place.home}/${APP_RECORD.join('/')}`)
  if (recordText !== null) {
    try {
      const record = appRecordSchema.safeParse(JSON.parse(recordText))
      if (record.success) {
        found.push({ path: record.data.executable, from: 'where the app last ran' })
      }
    } catch {
      // A record nobody can read is a record that says nothing.
    }
  }

  if (place.platform === 'win32') {
    const local = place.env['LOCALAPPDATA']
    const programs = place.env['ProgramFiles']
    if (local !== undefined) {
      found.push({
        path: `${local}\\Programs\\Piano\\Piano.exe`,
        from: 'the default install location',
      })
    }
    if (programs !== undefined) {
      found.push({ path: `${programs}\\Piano\\Piano.exe`, from: 'the default install location' })
    }
  } else if (place.platform === 'darwin') {
    found.push({ path: '/Applications/Piano.app', from: 'Applications' })
    found.push({ path: `${place.home}/Applications/Piano.app`, from: 'Applications' })
  }
  return found
}

/** The first place the app really is, and how to start it from there. */
export function findApp(place: Place): Found | null {
  const found = candidates(place).find((candidate) => place.exists(candidate.path))
  if (found === undefined) {
    return null
  }
  // A bundle is opened rather than run, which is what macOS expects of one.
  return found.path.endsWith('.app')
    ? { command: 'open', args: ['-a', found.path], from: found.from }
    : { command: found.path, args: [], from: found.from }
}

/** Where it looked, said plainly for a message about not finding it. */
export function whereLooked(place: Place): string {
  const tried = candidates(place).map((candidate) => candidate.path)
  return tried.length === 0 ? 'nowhere this platform installs it by default' : tried.join(', ')
}
