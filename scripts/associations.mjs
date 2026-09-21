/**
 * What an installed piano must have told the system, and how to tell.
 *
 * Building a package proves the configuration parses; it proves nothing about
 * what a system does with it. electron-builder's NSIS template calls
 * `customInstall` by name, so a macro spelled differently is never called and
 * the build still succeeds. macOS reads the document types only once the app is
 * registered with Launch Services. Linux reads the desktop entry's MimeType
 * only where the AppImage has been integrated.
 *
 * The reading is split from the doing on purpose. Installing, mounting and
 * extracting belong to one system each and can only run there; deciding what
 * the readings mean is text in, findings out, and is tested here. What the
 * three systems print is not a contract of theirs, so every failure carries
 * what was read rather than only the claim it failed.
 */

/** @typedef {{ ok: boolean, what: string, detail: string }} Finding */

/**
 * A registry value, or null where the key or the value is not there. The
 * empty string is a value that exists and holds nothing, which is what an
 * OpenWithProgids entry is.
 *
 * @typedef {(key: string, value: string) => string | null} ReadRegistry
 */

/** The program id build/installer.nsh writes for MIDI, which is ours to spell. */
export const MIDI_PROGID = 'Piano.midi'

const CLASSES = 'HKCU\\Software\\Classes'

/** The extensions a score and a MIDI file are known by. */
export const SCORE_EXT = '.piano'
export const MIDI_EXTS = ['.mid', '.midi']

/**
 * One row of `reg query` output, or null where the value is absent.
 *
 * `reg query` prints a row per value: four spaces, the name, four spaces, the
 * type, four spaces, the data. A value holding nothing prints no data at all,
 * which is why the data group is optional and an absent one reads as the empty
 * string rather than as a missing value.
 *
 * The key's default value is the one row whose name is in parentheses, and it
 * is printed in the system's own language — `(Default)` on an English Windows,
 * `(padrão)` on a Portuguese one. So the parentheses are what identifies it:
 * matching the English word reads a localised machine as having no default
 * value at all, which is a pass turning into a failure over a language.
 *
 * @param {string} output
 * @param {string} value the value name, or '' for the key's default
 * @returns {string | null}
 */
export function parseRegQuery(output, value) {
  const wanted = value.toLowerCase()
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(.+?)\s{2,}(REG_[A-Z_]+)(?:\s{2,}(.*?))?\s*$/.exec(line)
    if (match === null) {
      continue
    }
    const name = match[1] ?? ''
    const found = value === '' ? /^\(.+\)$/.test(name) : name.toLowerCase() === wanted
    if (found) {
      return match[3] ?? ''
    }
  }
  return null
}

/**
 * Whether a shell command starts the executable at this path.
 *
 * The registry holds it quoted and with a `%1` after it, and Windows is
 * indifferent to case and to which slash, so none of that is compared.
 *
 * @param {string | null} command
 * @param {string} exe
 * @returns {boolean}
 */
export function namesExecutable(command, exe) {
  if (command === null) {
    return false
  }
  const flat = (/** @type {string} */ text) => text.toLowerCase().replaceAll('/', '\\')
  return flat(command).includes(flat(exe))
}

/**
 * What the registry must say once the installer has run.
 *
 * A score is claimed outright, so the check follows the program id the
 * registry itself names rather than one spelled here: the claim is that
 * something owns `.piano` and starts the piano, not that it is called
 * anything in particular. MIDI is the opposite — the program id is ours, from
 * build/installer.nsh, and the whole point is that it is offered under Open
 * With without becoming what a `.mid` opens with.
 *
 * @param {ReadRegistry} read
 * @param {string} exe where the installer put the executable
 * @returns {Finding[]}
 */
export function windowsInstalled(read, exe) {
  /** @type {Finding[]} */
  const findings = []

  const progId = read(`${CLASSES}\\${SCORE_EXT}`, '')
  findings.push({
    ok: progId !== null && progId !== '',
    what: `${SCORE_EXT} is claimed by a program id`,
    detail: progId === null || progId === '' ? `nothing at ${CLASSES}\\${SCORE_EXT}` : progId,
  })

  if (progId !== null && progId !== '') {
    const command = read(`${CLASSES}\\${progId}\\shell\\open\\command`, '')
    findings.push({
      ok: namesExecutable(command, exe),
      what: `${progId} opens with the installed piano`,
      detail: command ?? `nothing at ${CLASSES}\\${progId}\\shell\\open\\command`,
    })
  }

  for (const ext of MIDI_EXTS) {
    const offered = read(`${CLASSES}\\${ext}\\OpenWithProgids`, MIDI_PROGID)
    findings.push({
      ok: offered !== null,
      what: `${ext} offers the piano under Open With`,
      detail:
        offered === null
          ? `no ${MIDI_PROGID} value at ${CLASSES}\\${ext}\\OpenWithProgids — customInstall did not run`
          : `${MIDI_PROGID} is listed`,
    })

    const taken = read(`${CLASSES}\\${ext}`, '')
    findings.push({
      ok: taken !== MIDI_PROGID,
      what: `${ext} still opens with whatever it opened with`,
      detail: taken === null || taken === '' ? 'no default handler is named here' : taken,
    })
  }

  const midiCommand = read(`${CLASSES}\\${MIDI_PROGID}\\shell\\open\\command`, '')
  findings.push({
    ok: namesExecutable(midiCommand, exe),
    what: `${MIDI_PROGID} opens with the installed piano`,
    detail: midiCommand ?? `nothing at ${CLASSES}\\${MIDI_PROGID}\\shell\\open\\command`,
  })

  return findings
}

/**
 * What the registry must no longer say once the uninstaller has run.
 *
 * An uninstall that leaves its keys behind offers a piano that is not there
 * any more, which is worse than never having offered one.
 *
 * @param {ReadRegistry} read
 * @returns {Finding[]}
 */
export function windowsRemoved(read) {
  /** @type {Finding[]} */
  const findings = []

  for (const ext of MIDI_EXTS) {
    const offered = read(`${CLASSES}\\${ext}\\OpenWithProgids`, MIDI_PROGID)
    findings.push({
      ok: offered === null,
      what: `${ext} no longer offers the piano`,
      detail: offered === null ? 'gone' : `${MIDI_PROGID} is still listed`,
    })
  }

  const midi = read(`${CLASSES}\\${MIDI_PROGID}`, '')
  findings.push({
    ok: midi === null,
    what: `${MIDI_PROGID} is gone`,
    detail: midi === null ? 'gone' : `still at ${CLASSES}\\${MIDI_PROGID}`,
  })

  const score = read(`${CLASSES}\\${SCORE_EXT}`, '')
  findings.push({
    ok: score === null,
    what: `${SCORE_EXT} is gone`,
    detail: score === null ? 'gone' : `still claimed by ${score}`,
  })

  return findings
}

/**
 * The desktop entry an AppImage carries, as a system reads it.
 *
 * A MimeType line is what puts the piano in a file manager's Open With, and a
 * field code in Exec is what hands the file over: without one the piano opens
 * with nothing, which looks like a broken association rather than a missing
 * argument.
 *
 * @param {string} text
 * @returns {Finding[]}
 */
export function desktopEntry(text) {
  const value = (/** @type {string} */ key) => {
    const match = new RegExp(`^${key}=(.*)$`, 'm').exec(text)
    return match === null ? null : (match[1] ?? '').trim()
  }

  const mime = value('MimeType') ?? ''
  const exec = value('Exec') ?? ''
  const types = mime
    .split(';')
    .map((one) => one.trim())
    .filter((one) => one !== '')

  return [
    {
      ok: /^\[Desktop Entry\]/m.test(text),
      what: 'the file is a desktop entry',
      detail: text.slice(0, 60).trim(),
    },
    {
      ok: types.includes('application/x-piano-score'),
      what: 'a score opens with the piano',
      detail: mime === '' ? 'no MimeType line' : mime,
    },
    {
      ok: types.includes('audio/midi'),
      what: 'a MIDI file offers the piano',
      detail: mime === '' ? 'no MimeType line' : mime,
    },
    {
      ok: /%[uUfF]/.test(exec),
      what: 'the file being opened is handed over',
      detail: exec === '' ? 'no Exec line' : exec,
    },
  ]
}

/**
 * One claim in an `lsregister -dump` record: what it binds, and how strongly.
 *
 * @param {string} record
 * @returns {{ id: string, rank: string, bindings: string[] }[]}
 */
export function claimsIn(record) {
  /** @type {{ id: string, rank: string, bindings: string[] }[]} */
  const claims = []
  for (const line of record.split(/\r?\n/)) {
    const started = /claim\s+id:\s*(\S*)/.exec(line)
    if (started !== null) {
      claims.push({ id: started[1] ?? '', rank: '', bindings: [] })
      continue
    }
    const claim = claims.at(-1)
    if (claim === undefined) {
      continue
    }
    const rank = /^\s*rank:\s*(\S+)/.exec(line)
    if (rank !== null) {
      claim.rank = rank[1] ?? ''
    }
    const bindings = /^\s*bindings:\s*(.+)$/.exec(line)
    if (bindings !== null) {
      claim.bindings = (bindings[1] ?? '')
        .split(',')
        .map((one) => one.trim())
        .filter((one) => one !== '')
    }
  }
  return claims
}

/**
 * What Launch Services knows about the app it has just been shown.
 *
 * The dump is a debugging output and not an interface, so what is asked of it
 * is only what the association is: the bundle is known at all, a score is
 * bound to it as its owner, and MIDI is bound as an alternative rather than
 * taken over.
 *
 * @param {string} dump
 * @param {string} bundleId
 * @returns {Finding[]}
 */
export function launchServices(dump, bundleId) {
  // The whole value on its own line: `com.alegauss.piano.score` is a claim of
  // this bundle's and not another bundle whose id starts the same way.
  const named = new RegExp(`^\\s*bundle\\s+id:\\s*${bundleId.replaceAll('.', '\\.')}\\s*$`, 'im')
  const record = dump.split(/^-{10,}$/m).find((one) => named.test(one))

  if (record === undefined) {
    return [
      {
        ok: false,
        what: `Launch Services knows ${bundleId}`,
        detail: 'no record for the bundle id in the dump',
      },
    ]
  }

  const claims = claimsIn(record)
  const bound = (/** @type {string[]} */ extensions) =>
    claims.filter((claim) =>
      claim.bindings.some((binding) => extensions.includes(binding.toLowerCase())),
    )
  const said = (/** @type {{ rank: string, bindings: string[] }[]} */ found) =>
    found.length === 0
      ? 'nothing is bound'
      : found.map((claim) => `${claim.bindings.join(' ')} ${claim.rank}`).join(', ')

  const score = bound([SCORE_EXT])
  const midi = bound(MIDI_EXTS)

  return [
    { ok: true, what: `Launch Services knows ${bundleId}`, detail: `${claims.length} claims` },
    {
      ok: score.some((claim) => claim.rank.toLowerCase() === 'owner'),
      what: `${SCORE_EXT} is bound to the piano as its owner`,
      detail: said(score),
    },
    {
      ok: midi.length > 0 && midi.every((claim) => claim.rank.toLowerCase() === 'alternate'),
      what: 'MIDI is bound as an alternative and not taken over',
      detail: said(midi),
    },
  ]
}

/**
 * Say how it went, and answer whether anything failed.
 *
 * @param {string} where
 * @param {Finding[]} findings
 * @param {(text: string) => void} write
 * @returns {boolean}
 */
export function report(where, findings, write) {
  for (const finding of findings) {
    write(`${finding.ok ? 'pass' : 'FAIL'}  ${where}: ${finding.what}  (${finding.detail})\n`)
  }
  return findings.every((finding) => finding.ok)
}
