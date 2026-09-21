import type { Level } from '@piano/score-format'

/**
 * The way to the window somebody is looking at.
 *
 * The tools are one half of the premise and this is the other: a sentence
 * makes a piano play only if the sentence reaches the piano. Finding the
 * running app and agreeing on a channel with it is its own task, so what lives
 * here is the shape of what is sent — a small closed set of commands, none of
 * which carries a path or a script — and an answer for the case where no
 * window is listening yet.
 *
 * Keeping the commands closed is deliberate. The app takes what it is given
 * and does one of eight things; there is no tool that hands it code, a file
 * name or a tick number it did not derive itself.
 */

/** What to repeat, in the words somebody says it in. */
export type PassageAsk =
  | { readonly kind: 'section'; readonly id: string }
  | { readonly kind: 'bars'; readonly from: number; readonly to: number }

/** A drill, as one request: the passage, the hands and the tempo ladder. */
export type DrillAsk = {
  readonly passage: PassageAsk
  readonly hands?: readonly ('left' | 'right')[]
  /** Whether the hand the player has not taken accompanies them or says nothing. */
  readonly other?: 'accompanies' | 'silent'
  readonly from?: number
  readonly step?: number
  readonly to?: number
  readonly countIn?: boolean
}

export type Command =
  | { readonly kind: 'play'; readonly score?: string }
  | { readonly kind: 'stop' }
  | { readonly kind: 'seek'; readonly bar?: number; readonly section?: string }
  | { readonly kind: 'tempo'; readonly scale: number }
  | { readonly kind: 'transpose'; readonly semitones: number }
  | { readonly kind: 'level'; readonly level: Level }
  | { readonly kind: 'state' }
  | { readonly kind: 'practise'; readonly drill: DrillAsk }

export type LinkResult = {
  readonly ok: boolean
  readonly text: string
  readonly data?: unknown
}

export type Link = {
  readonly send: (command: Command) => Promise<LinkResult>
}

/**
 * What every transport tool answers until the app can be found.
 *
 * Said plainly rather than as a failure, because the caller is a model that
 * will otherwise try the same tool again: there is nothing wrong with the
 * request, there is nothing at the other end of it yet.
 */
export function noWindow(): Link {
  return {
    send: () =>
      Promise.resolve({
        ok: false,
        text:
          'No piano window is listening. The tools that read and write scores work anyway; ' +
          'the ones that drive playback need the app open and a channel to it, which is not ' +
          'built yet.',
      }),
  }
}
