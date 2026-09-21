import type { AudioTime, PianoEngine } from '../audio'
import type { MidiEvent } from './midi'

/**
 * Playing by hand: what a player presses reaches the piano.
 *
 * Both inputs arrive here in the same shape, so the engine never learns
 * whether a note came from a controller or from the Z key, and anything
 * added later — a second controller, a touchscreen — needs no new path.
 *
 * Live notes are sounded at the pitch pressed, deliberately not through the
 * transport's transposition. A player pressing middle C expects middle C:
 * transposing what someone plays by hand would mean the key under the finger
 * and the sound coming back disagree, which is the one thing no instrument
 * does.
 *
 * Nothing is scheduled. A note sounds at the clock's now, because it has
 * already happened: adding a scheduling lead here would make the app answer
 * late to its own player.
 */
export function playLive(
  engine: Pick<PianoEngine, 'noteOn' | 'noteOff' | 'pedal'>,
  now: () => AudioTime,
  event: MidiEvent,
): void {
  const at = now()
  switch (event.kind) {
    case 'on':
      engine.noteOn(event.pitch, event.velocity, at)
      return
    case 'off':
      engine.noteOff(event.pitch, at)
      return
    case 'pedal':
      engine.pedal(event.pedal, event.value, at)
      return
    default:
      // Anything the boundary could not name is for the monitor to show, not
      // for the piano to guess at.
      return
  }
}
