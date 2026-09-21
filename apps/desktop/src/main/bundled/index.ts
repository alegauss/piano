import minuetInG from './minuet-in-g.score.json' with { type: 'json' }
import odeToJoy from './ode-to-joy.score.json' with { type: 'json' }
import preludeInC from './prelude-in-c.score.json' with { type: 'json' }

/**
 * The scores the app ships with, so a first launch has something to play.
 *
 * Chosen rather than found: one a beginner can play within minutes, one
 * familiar enough that a listener hears at once whether playback is right, and
 * one dense enough to put the roll and the audio engine under real load. Each
 * is public domain and says where its notes came from, which the packaging
 * test holds them to, and each carries a beginner, an intermediate and an
 * advanced arrangement authored by hand, which makes them the reference for
 * what an arrangement should be as well as the first thing anybody hears.
 *
 * They reach the library once, on a first launch, where the Library panel and
 * Claude Code's tools both find them.
 */
export const BUNDLED_SCORES: readonly unknown[] = [odeToJoy, minuetInG, preludeInC]
