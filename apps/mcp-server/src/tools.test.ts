import { VALID_FIXTURES } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { createLibrary, type Files } from './library'
import { noWindow, type Command, type Link } from './link'
import { toolsFor, type Tool } from './tools'

/**
 * The surface a model reads, asked the questions a model would ask of it: does
 * every tool say what it does, does a bad call come back repairable, and does
 * anything here reach past the library.
 */

function memory(): Files {
  const held = new Map<string, string>()
  return {
    read: (path) => {
      const text = held.get(path)
      return text === undefined ? Promise.reject(new Error('no')) : Promise.resolve(text)
    },
    write: (path, text) => {
      held.set(path, text)
      return Promise.resolve()
    },
    list: (dir) =>
      Promise.resolve(
        [...held.keys()]
          .filter((path) => path.startsWith(`${dir}/`))
          .map((path) => path.slice(dir.length + 1)),
      ),
    ensure: () => Promise.resolve(),
  }
}

/** A window that writes down what it was asked and agrees to everything. */
function listening(): Link & { readonly heard: Command[] } {
  const heard: Command[] = []
  return {
    heard,
    send: (command) => {
      heard.push(command)
      return Promise.resolve({ ok: true, text: 'done' })
    },
  }
}

function setup(link: Link = listening()) {
  const tools = toolsFor(createLibrary('/library', memory()), link)
  const by = (name: string): Tool => {
    const found = tools.find((one) => one.name === name)
    if (found === undefined) {
      throw new Error(`no tool called ${name}`)
    }
    return found
  }
  return { tools, by }
}

const minimal = VALID_FIXTURES.minimal as unknown

describe('the surface itself', () => {
  it('offers the tools the premise needs, and nothing that writes a file somebody names', () => {
    const { tools } = setup()
    expect(tools.map((one) => one.name).sort()).toEqual(
      [
        'list_scores',
        'piano_state',
        'play',
        'practise',
        'read_score',
        'save_score',
        'search_scores',
        'seek',
        'set_level',
        'set_tempo',
        'set_transpose',
        'stop',
        'validate_score',
      ].sort(),
    )
  })

  it('says what each tool does, for a model reading it cold', () => {
    for (const one of setup().tools) {
      expect(one.title.length, one.name).toBeGreaterThan(0)
      // Long enough to say what it takes and what comes back, which is the
      // difference between a tool that gets called and one that gets guessed.
      expect(one.description.length, one.name).toBeGreaterThan(80)
      expect(one.description.trim(), one.name).toBe(one.description)
    }
  })

  it('refuses a call that does not fit, naming the field rather than saying no', async () => {
    const { by } = setup()
    const answer = await by('set_tempo').run({ scale: 9 })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('scale')
  })
})

describe('the score tools', () => {
  it('validates with the app’s own rules, and says what is wrong in the same words', async () => {
    const { by } = setup()
    expect((await by('validate_score').run({ score: minimal })).ok).toBe(true)

    const bad = await by('validate_score').run({ score: { formatVersion: 1, metadata: {} } })
    expect(bad.ok).toBe(false)
    expect(bad.text).toContain('title')
  })

  it('saves a score under an id the other tools can address it by', async () => {
    const { by } = setup()
    const saved = await by('save_score').run({ score: minimal })
    expect(saved.ok).toBe(true)

    const listed = await by('list_scores').run({})
    expect(listed.text).toContain((saved.data as { id: string }).id)
  })

  it('refuses to save what it would refuse to validate', async () => {
    const { by } = setup()
    const answer = await by('save_score').run({ score: { formatVersion: 1, metadata: {} } })
    expect(answer.ok).toBe(false)
  })

  it('reads a score back, and says plainly when there is none', async () => {
    const { by } = setup()
    const saved = await by('save_score').run({ score: minimal })
    const id = (saved.data as { id: string }).id

    expect((await by('read_score').run({ id })).ok).toBe(true)
    const missing = await by('read_score').run({ id: 'not-here' })
    expect(missing.ok).toBe(false)
    expect(missing.text).toContain('not-here')
  })

  it('says the library is empty rather than answering with nothing', async () => {
    const { by } = setup()
    expect((await by('list_scores').run({})).text).toContain('empty')
  })
})

describe('the transport tools', () => {
  it('sends one command for one call', async () => {
    const link = listening()
    const { by } = setup(link)

    await by('play').run({ score: 'prelude' })
    await by('stop').run({})
    await by('set_tempo').run({ scale: 0.5 })
    await by('set_transpose').run({ semitones: -2 })
    await by('set_level').run({ level: 'beginner' })
    await by('piano_state').run({})

    expect(link.heard).toEqual([
      { kind: 'play', score: 'prelude' },
      { kind: 'stop' },
      { kind: 'tempo', scale: 0.5 },
      { kind: 'transpose', semitones: -2 },
      { kind: 'level', level: 'beginner' },
      { kind: 'state' },
    ])
  })

  it('goes to a bar or a passage, and asks which where both or neither is named', async () => {
    const link = listening()
    const { by } = setup(link)

    expect((await by('seek').run({ bar: 17 })).ok).toBe(true)
    expect((await by('seek').run({ section: 'chorus' })).ok).toBe(true)
    expect((await by('seek').run({})).ok).toBe(false)
    expect((await by('seek').run({ bar: 1, section: 'chorus' })).ok).toBe(false)
    expect(link.heard).toHaveLength(2)
  })

  it('takes a drill as one request, in the words somebody says it in', async () => {
    const link = listening()
    const { by } = setup(link)

    await by('practise').run({
      bars: { from: 17, to: 20 },
      hands: ['left'],
      other: 'silent',
      from: 0.5,
      countIn: true,
    })

    expect(link.heard[0]).toEqual({
      kind: 'practise',
      drill: {
        passage: { kind: 'bars', from: 17, to: 20 },
        hands: ['left'],
        other: 'silent',
        from: 0.5,
        countIn: true,
      },
    })
  })

  it('practises a named passage as readily as a run of bars', async () => {
    const link = listening()
    const { by } = setup(link)
    await by('practise').run({ section: 'bridge' })
    expect(link.heard[0]).toMatchObject({ drill: { passage: { kind: 'section', id: 'bridge' } } })
  })

  it('asks for the passage rather than drilling the whole piece', async () => {
    const { by } = setup()
    const answer = await by('practise').run({ hands: ['left'] })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('passage')
  })

  it('says why nothing happened while no window is listening', async () => {
    const { by } = setup(noWindow())
    const answer = await by('play').run({})
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('No piano window is listening')

    // And the tools that do not need a window still work.
    expect((await by('validate_score').run({ score: minimal })).ok).toBe(true)
  })
})
