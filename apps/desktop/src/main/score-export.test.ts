import { importMidi, notesOf, type Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { exportScore, midiFileName } from './score-export'

/**
 * Saving a score as MIDI with the dialog and the disk faked: what is written
 * is a file the format reads back as the same notes, and what could not go in
 * is said afterwards.
 */

const score: Score = {
  formatVersion: 1,
  metadata: { title: 'Ode to Joy' },
  notes: [
    { pitch: 64, start: 0, duration: 440, velocity: 80, hand: 'right', finger: 3 },
    { pitch: 64, start: 480, duration: 440, velocity: 76, hand: 'right', finger: 3 },
    { pitch: 65, start: 960, duration: 440, velocity: 76, hand: 'right', finger: 4 },
  ],
}

function disk(chosen: string | null = 'C:/Music/Ode to Joy.mid') {
  const written = new Map<string, Uint8Array>()
  const suggested: string[] = []
  return {
    written,
    suggested,
    deps: {
      choose: (name: string) => {
        suggested.push(name)
        return Promise.resolve(chosen)
      },
      write: (path: string, bytes: Uint8Array) => {
        written.set(path, bytes)
        return Promise.resolve()
      },
    },
  }
}

describe('saving a score as MIDI', () => {
  it('writes a file the format reads back as the same notes, and says what it left out', async () => {
    const { deps, written, suggested } = disk()
    const result = await exportScore({ score, level: null }, deps)
    expect(suggested).toEqual(['Ode to Joy.mid'])
    expect(result).toMatchObject({ kind: 'saved', name: 'Ode to Joy.mid' })
    if (result.kind === 'saved') {
      expect(result.dropped.join(' ')).toContain('fingering')
    }
    const back = importMidi(written.get('C:/Music/Ode to Joy.mid') ?? new Uint8Array())
    expect(back.ok).toBe(true)
    if (back.ok) {
      expect(notesOf(back.score).map((note) => note.pitch)).toEqual([64, 64, 65])
    }
  })

  it('names the level in the file when it saves an arrangement', async () => {
    const { deps, suggested } = disk()
    await exportScore({ score, level: 'beginner' }, deps)
    expect(suggested).toEqual(['Ode to Joy (beginner).mid'])
  })

  it('writes nothing when the dialog is closed', async () => {
    const { deps, written } = disk(null)
    expect(await exportScore({ score, level: null }, deps)).toEqual({ kind: 'cancelled' })
    expect(written.size).toBe(0)
  })

  it('refuses a score the format does not accept, before asking anything', async () => {
    const { deps, suggested } = disk()
    const result = await exportScore(
      { score: { formatVersion: 1, metadata: {} }, level: null },
      deps,
    )
    expect(result.kind).toBe('refused')
    expect(suggested).toEqual([])
  })

  it('says so when the file cannot be written', async () => {
    const result = await exportScore(
      { score, level: null },
      {
        choose: () => Promise.resolve('/readonly/x.mid'),
        write: () => Promise.reject(new Error('permission denied')),
      },
    )
    expect(result).toEqual({
      kind: 'refused',
      message: 'the file could not be written: permission denied',
    })
  })

  it('suggests a name any file system accepts', () => {
    expect(midiFileName('Prelude: C/major? <draft>', null)).toBe('Prelude C major draft.mid')
    expect(midiFileName('Line\nbreak', 'advanced')).toBe('Line break (advanced).mid')
    expect(midiFileName('???', null)).toBe('Score.mid')
  })
})
