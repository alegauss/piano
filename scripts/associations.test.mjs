import { describe, expect, it } from 'vitest'

import {
  claimsIn,
  desktopEntry,
  launchServices,
  MIDI_PROGID,
  namesExecutable,
  parseRegQuery,
  report,
  windowsInstalled,
  windowsRemoved,
} from './associations.mjs'

/**
 * What the three systems say, and what it means.
 *
 * The outputs here are the shapes `reg query`, `lsregister -dump` and an
 * AppImage's desktop entry produce. Installing and mounting can only happen on
 * the system they are for; deciding what the answer means cannot wait for a
 * release to find out it was wrong.
 */

const EXE = 'C:\\Users\\somebody\\AppData\\Local\\Temp\\piano-1\\Piano.exe'

/**
 * A registry as `reg query` would answer it: the keys named here exist, and
 * anything else does not.
 *
 * @param {Record<string, Record<string, string>>} keys
 * @returns {import('./associations.mjs').ReadRegistry}
 */
function fakeRegistry(keys) {
  return (key, value) => {
    const held = keys[key]
    if (held === undefined) {
      return null
    }
    return held[value === '' ? '(Default)' : value] ?? null
  }
}

/**
 * A registry after an install that did everything it claims.
 *
 * @returns {Record<string, Record<string, string>>}
 */
function installed() {
  return {
    'HKCU\\Software\\Classes\\.piano': { '(Default)': 'Piano.piano' },
    'HKCU\\Software\\Classes\\Piano.piano\\shell\\open\\command': {
      '(Default)': `"${EXE}" "%1"`,
    },
    'HKCU\\Software\\Classes\\.mid\\OpenWithProgids': { 'Piano.midi': '' },
    'HKCU\\Software\\Classes\\.midi\\OpenWithProgids': { 'Piano.midi': '' },
    'HKCU\\Software\\Classes\\.mid': { '(Default)': 'WMP11.AssocFile.MIDI' },
    'HKCU\\Software\\Classes\\Piano.midi\\shell\\open\\command': { '(Default)': `"${EXE}" "%1"` },
  }
}

/** @param {import('./associations.mjs').Finding[]} findings */
function failed(findings) {
  return findings.filter((finding) => !finding.ok).map((finding) => finding.what)
}

describe('reading a registry value', () => {
  const output = [
    '',
    'HKEY_CURRENT_USER\\Software\\Classes\\.mid\\OpenWithProgids',
    '    Piano.midi    REG_SZ',
    '    WMP11.AssocFile.MIDI    REG_NONE',
    '',
  ].join('\r\n')

  it('finds a value that exists and holds nothing', () => {
    expect(parseRegQuery(output, 'Piano.midi')).toBe('')
  })

  it('answers null for a value that is not there', () => {
    expect(parseRegQuery(output, 'Nothing.here')).toBeNull()
  })

  it('reads the default value, whatever the system calls it', () => {
    // A runner says (Default); a Portuguese Windows says (padrão). Reading
    // only the English one would report a localised machine as unassociated.
    for (const said of ['(Default)', '(padrão)', '(Standard)']) {
      const value = [
        '',
        'HKEY_CURRENT_USER\\Software\\Classes\\.piano',
        `    ${said}    REG_SZ    Piano.piano`,
        '',
      ].join('\r\n')
      expect(parseRegQuery(value, '')).toBe('Piano.piano')
    }
  })

  it('does not take a named value for the default one', () => {
    const value = '    Piano.midi    REG_SZ    something'
    expect(parseRegQuery(value, '')).toBeNull()
  })

  it('keeps a path with spaces in it whole', () => {
    const value = '    (Default)    REG_SZ    "C:\\Program Files\\Piano\\Piano.exe" "%1"'
    expect(parseRegQuery(value, '')).toBe('"C:\\Program Files\\Piano\\Piano.exe" "%1"')
  })
})

describe('what an open command names', () => {
  it('ignores the quoting, the argument and which slash', () => {
    expect(namesExecutable(`"${EXE}" "%1"`, EXE)).toBe(true)
    expect(namesExecutable(`"${EXE.replaceAll('\\', '/').toUpperCase()}"`, EXE)).toBe(true)
    expect(namesExecutable('"C:\\Somewhere Else\\Piano.exe" "%1"', EXE)).toBe(false)
    expect(namesExecutable(null, EXE)).toBe(false)
  })
})

describe('what Windows must say after an install', () => {
  it('passes a registry with a score claimed and MIDI only offered', () => {
    expect(failed(windowsInstalled(fakeRegistry(installed()), EXE))).toEqual([])
  })

  it('fails when customInstall never ran, which a build cannot tell you', () => {
    const without = installed()
    delete without['HKCU\\Software\\Classes\\.mid\\OpenWithProgids']
    delete without['HKCU\\Software\\Classes\\.midi\\OpenWithProgids']
    delete without['HKCU\\Software\\Classes\\Piano.midi\\shell\\open\\command']

    const failures = failed(windowsInstalled(fakeRegistry(without), EXE))
    expect(failures).toContain('.mid offers the piano under Open With')
    expect(failures).toContain(`${MIDI_PROGID} opens with the installed piano`)
  })

  it('fails when MIDI has been taken over rather than offered', () => {
    const taken = installed()
    taken['HKCU\\Software\\Classes\\.mid'] = { '(Default)': MIDI_PROGID }
    expect(failed(windowsInstalled(fakeRegistry(taken), EXE))).toEqual([
      '.mid still opens with whatever it opened with',
    ])
  })

  it('fails when a score is claimed by a program id that starts nothing', () => {
    const broken = installed()
    delete broken['HKCU\\Software\\Classes\\Piano.piano\\shell\\open\\command']
    expect(failed(windowsInstalled(fakeRegistry(broken), EXE))).toEqual([
      'Piano.piano opens with the installed piano',
    ])
  })

  it('fails when nothing claims a score at all', () => {
    const none = installed()
    delete none['HKCU\\Software\\Classes\\.piano']
    expect(failed(windowsInstalled(fakeRegistry(none), EXE))).toContain(
      '.piano is claimed by a program id',
    )
  })
})

describe('what Windows must no longer say after an uninstall', () => {
  it('passes an empty registry', () => {
    expect(failed(windowsRemoved(fakeRegistry({})))).toEqual([])
  })

  it('fails on an entry left behind, which offers a piano that is gone', () => {
    const left = { 'HKCU\\Software\\Classes\\.mid\\OpenWithProgids': { 'Piano.midi': '' } }
    expect(failed(windowsRemoved(fakeRegistry(left)))).toEqual(['.mid no longer offers the piano'])
  })
})

describe('the desktop entry an AppImage carries', () => {
  const entry = [
    '[Desktop Entry]',
    'Name=Piano',
    'Exec=AppRun --no-sandbox %U',
    'Terminal=false',
    'Type=Application',
    'MimeType=application/x-piano-score;audio/midi;',
    'Categories=Audio;',
    '',
  ].join('\n')

  it('passes an entry that offers both and takes the file', () => {
    expect(failed(desktopEntry(entry))).toEqual([])
  })

  it('fails where nothing says which files it opens', () => {
    expect(failed(desktopEntry(entry.replace(/^MimeType=.*$/m, 'MimeType=')))).toEqual([
      'a score opens with the piano',
      'a MIDI file offers the piano',
    ])
  })

  it('fails where the file being opened is never handed over', () => {
    expect(failed(desktopEntry(entry.replace(' %U', '')))).toEqual([
      'the file being opened is handed over',
    ])
  })
})

describe('what Launch Services knows', () => {
  const dump = [
    '--------------------------------------------------------------------------------',
    'bundle  id:            1234',
    '\tpath:                  /Applications/Something.app',
    '\tbundle id:             com.example.something',
    '--------------------------------------------------------------------------------',
    'bundle  id:            5678',
    '\tpath:                  /private/tmp/Piano.app',
    '\tbundle id:             com.alegauss.piano',
    '\tclaim   id:            com.alegauss.piano.score',
    '\t\tname:                  Piano score',
    '\t\trank:                  Owner',
    '\t\troles:                 Editor',
    '\t\tbindings:              .piano',
    '\tclaim   id:            com.alegauss.piano.midi',
    '\t\tname:                  MIDI file',
    '\t\trank:                  Alternate',
    '\t\troles:                 Viewer',
    '\t\tbindings:              .mid, .midi',
    '--------------------------------------------------------------------------------',
  ].join('\n')

  it('reads a claim as what it binds and how strongly', () => {
    const claims = claimsIn(dump)
    expect(claims).toHaveLength(2)
    expect(claims[1]).toMatchObject({ rank: 'Alternate', bindings: ['.mid', '.midi'] })
  })

  it('passes a bundle that owns a score and only offers MIDI', () => {
    expect(failed(launchServices(dump, 'com.alegauss.piano'))).toEqual([])
  })

  it('fails when the app was never registered', () => {
    expect(failed(launchServices(dump, 'com.alegauss.nothing'))).toEqual([
      'Launch Services knows com.alegauss.nothing',
    ])
  })

  it('fails when MIDI is claimed as the owner rather than an alternative', () => {
    const owned = dump.replace('rank:                  Alternate', 'rank:                  Owner')
    expect(failed(launchServices(owned, 'com.alegauss.piano'))).toEqual([
      'MIDI is bound as an alternative and not taken over',
    ])
  })
})

describe('saying how it went', () => {
  it('names every finding and answers whether anything failed', () => {
    /** @type {string[]} */
    const lines = []
    const ok = report(
      'windows',
      [
        { ok: true, what: 'a score is claimed', detail: 'Piano.piano' },
        { ok: false, what: 'MIDI is offered', detail: 'nothing there' },
      ],
      (line) => lines.push(line),
    )
    expect(ok).toBe(false)
    expect(lines[0]).toContain('pass  windows: a score is claimed')
    expect(lines[1]).toContain('FAIL  windows: MIDI is offered')
  })
})
