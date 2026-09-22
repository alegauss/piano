import { createLibrary, memoryFiles } from '@piano/library'
import { VALID_FIXTURES } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { noWindow, type Command, type Link } from './link'
import { toolsFor, type Tool } from './tools'

/**
 * The surface a model reads, asked the questions a model would ask of it: does
 * every tool say what it does, does a bad call come back repairable, and does
 * anything here reach past the library.
 */

/** A window that writes down what it was asked and agrees to everything. */
function listening(): Link & { readonly heard: Command[] } {
  const heard: Command[] = []
  return {
    heard,
    listening: () => Promise.resolve(true),
    send: (command) => {
      heard.push(command)
      return Promise.resolve({ ok: true, text: 'done' })
    },
  }
}

function setup(link: Link = listening()) {
  const tools = toolsFor(createLibrary('/library', memoryFiles()), link)
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
        'correct_score',
        'delete_score',
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

  it('passes music that is probably wrong, with warnings naming the bar and the note', async () => {
    const { by } = setup()
    // The left hand an octave too high: valid, and almost certainly a slip.
    const crossed = {
      formatVersion: 1,
      metadata: { title: 'Crossed' },
      notes: [
        { pitch: 60, start: 0, duration: 1920, velocity: 80, hand: 'right' },
        { pitch: 67, start: 0, duration: 1920, velocity: 80, hand: 'left' },
      ],
    }
    const checked = await by('validate_score').run({ score: crossed })
    expect(checked.ok).toBe(true)
    expect(checked.text).toMatch(/^Valid: /)
    expect(checked.text).toContain('notes.1 (bar 1): expected the left hand below the right')
    expect(checked.data).toMatchObject({ valid: true, warnings: [{ kind: 'hands crossed' }] })

    const saved = await by('save_score').run({ score: crossed })
    expect(saved.ok).toBe(true)
    expect(saved.text).toContain('hands really cross')

    // Nothing is said about a score with nothing to say about it.
    const clean = await by('validate_score').run({ score: minimal })
    expect(clean.text).not.toContain('usually gets wrong')
    expect(clean.data).toEqual({ valid: true, warnings: [] })
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

  it('corrects the fields it is given and leaves the rest as they were', async () => {
    const { by } = setup(noWindow())
    await by('save_score').run({
      score: {
        formatVersion: 1,
        metadata: { id: 'aria', title: 'Aria', composer: 'Bach', tags: ['baroque'] },
        notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
      },
    })

    const answer = await by('correct_score').run({ id: 'aria', level: 'beginner' })

    expect(answer.ok).toBe(true)
    const read = await by('read_score').run({ id: 'aria' })
    expect((read.data as { metadata: Record<string, unknown> }).metadata).toMatchObject({
      title: 'Aria',
      composer: 'Bach',
      tags: ['baroque'],
      level: 'beginner',
    })
  })

  it('clears a field named as null, which is how a guessed composer is taken back', async () => {
    const { by } = setup(noWindow())
    await by('save_score').run({
      score: {
        formatVersion: 1,
        metadata: { id: 'aria', title: 'Aria', composer: 'Track 1' },
        notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
      },
    })

    await by('correct_score').run({ id: 'aria', composer: null })

    const read = await by('read_score').run({ id: 'aria' })
    expect((read.data as { metadata: Record<string, unknown> }).metadata.composer).toBeUndefined()
  })

  it('leaves the notes alone, which is the whole point of not re-saving the score', async () => {
    const { by } = setup(noWindow())
    const notes = [{ pitch: 72, start: 0, duration: 480, velocity: 80 }]
    await by('save_score').run({
      score: { formatVersion: 1, metadata: { id: 'aria', title: 'Aria' }, notes },
    })

    await by('correct_score').run({ id: 'aria', title: 'Aria in C' })

    const read = await by('read_score').run({ id: 'aria' })
    expect((read.data as { notes: unknown }).notes).toEqual(notes)
  })

  it('says which id a retitled piece is addressed by from now on', async () => {
    const { by } = setup(noWindow())
    // No id of its own, so it is addressed by its title and a retitle moves it.
    await by('save_score').run({
      score: {
        formatVersion: 1,
        metadata: { title: 'Untitled' },
        notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
      },
    })

    const answer = await by('correct_score').run({ id: 'untitled', title: 'Prelude in C' })

    expect(answer.ok).toBe(true)
    expect(answer.text).toContain('prelude-in-c')
    expect((await by('read_score').run({ id: 'untitled' })).ok).toBe(false)
    expect((await by('read_score').run({ id: 'prelude-in-c' })).ok).toBe(true)
  })

  it('asks the same question the window asks when that id is taken, and writes nothing', async () => {
    const { by } = setup(noWindow())
    await by('save_score').run({
      score: {
        formatVersion: 1,
        metadata: { title: 'Untitled' },
        notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
      },
    })
    await by('save_score').run({
      score: {
        formatVersion: 1,
        metadata: { title: 'Prelude in C', composer: 'Bach' },
        notes: [{ pitch: 60, start: 0, duration: 480, velocity: 80 }],
      },
    })

    const asked = await by('correct_score').run({ id: 'untitled', title: 'Prelude in C' })

    expect(asked.ok).toBe(false)
    expect(asked.text).toContain('Bach')
    expect(asked.text).toContain('beside')
    expect((await by('read_score').run({ id: 'untitled' })).ok).toBe(true)

    const beside = await by('correct_score').run({
      id: 'untitled',
      title: 'Prelude in C',
      taken: 'beside',
    })
    expect(beside.ok).toBe(true)
    expect((await by('read_score').run({ id: 'prelude-in-c-2' })).ok).toBe(true)
  })

  it('refuses to correct a score that is not there, rather than writing a new one', async () => {
    const { by } = setup(noWindow())
    const answer = await by('correct_score').run({ id: 'not-here', title: 'Whatever' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('not-here')
    expect((await by('list_scores').run({})).text).toContain('empty')
  })

  it('deletes a score by its id, and names what went', async () => {
    const { by } = setup(noWindow())
    await by('save_score').run({ score: minimal })
    const id = ((await by('save_score').run({ score: minimal })).data as { id: string }).id

    const answer = await by('delete_score').run({ id })

    expect(answer.ok).toBe(true)
    expect(answer.text).toContain(id)
    expect((await by('read_score').run({ id })).ok).toBe(false)
    expect((await by('list_scores').run({})).text).toContain('empty')
  })

  it('refuses to delete an id nothing is filed under rather than saying nothing', async () => {
    const { by } = setup(noWindow())
    const answer = await by('delete_score').run({ id: 'not-here' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('not-here')
  })

  it('has the window do the deleting where there is one, so the file can come back', async () => {
    const link = listening()
    const { by } = setup(link)
    await by('save_score').run({
      score: {
        formatVersion: 1,
        metadata: { id: 'aria', title: 'Aria' },
        notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
      },
    })

    const answer = await by('delete_score').run({ id: 'aria' })

    // The bin is the window's, and so is what it does about practice records.
    expect(answer.ok).toBe(true)
    expect(link.heard).toEqual([{ kind: 'remove', score: 'aria' }])
    expect((await by('read_score').run({ id: 'aria' })).ok).toBe(true)
  })

  it('has the window do the correcting where there is one, so the records follow', async () => {
    const link = listening()
    const { by } = setup(link)
    await by('save_score').run({
      score: {
        formatVersion: 1,
        metadata: { id: 'aria', title: 'Aria', composer: 'Bach' },
        notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
      },
    })

    const answer = await by('correct_score').run({ id: 'aria', level: 'beginner' })

    expect(answer.ok).toBe(true)
    // The fields it did not name are filled from what is there, here as much
    // as on the direct path: one shape reaches the window.
    expect(link.heard).toEqual([
      {
        kind: 'correct',
        score: 'aria',
        metadata: { title: 'Aria', composer: 'Bach', level: 'beginner' },
      },
    ])
  })

  it('says the library is empty rather than answering with nothing', async () => {
    const { by } = setup()
    expect((await by('list_scores').run({})).text).toContain('empty')
  })

  it('lists newest first when asked, saying how long each piece lasts', async () => {
    const { by } = setup()
    const piece = (id: string, level: string) => ({
      formatVersion: 1,
      metadata: { id, title: id, level },
      notes: [{ pitch: 60, start: 0, duration: 960, velocity: 80 }],
    })
    await by('save_score').run({ score: piece('later-and-harder', 'advanced') })
    await by('save_score').run({ score: piece('just-written', 'advanced') })
    await by('save_score').run({ score: piece('easy', 'beginner') })

    const newest = await by('list_scores').run({ order: 'newest' })
    expect(newest.text.split('\n')[0]).toBe('easy: easy (beginner, 0:01)')
    const found = await by('search_scores').run({ level: 'advanced', order: 'newest' })
    expect(found.text.split('\n').map((line) => line.split(':')[0])).toEqual([
      'just-written',
      'later-and-harder',
    ])
    expect((await by('list_scores').run({ order: 'loudest' })).ok).toBe(false)
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
