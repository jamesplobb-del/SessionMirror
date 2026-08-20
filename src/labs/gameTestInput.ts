/**
 * Touch input that stands in for an instrument, for testing the games.
 *
 * Off unless the build is made with `VITE_GAME_TEST_INPUT=1`:
 *
 *     VITE_GAME_TEST_INPUT=1 npm run cap:sync
 *
 * Vite inlines that comparison at build time, so in an ordinary build the
 * constant is `false`, every branch guarded by it is dead code, and the whole
 * feature is dropped from the bundle. It cannot reach a release build by
 * accident — there is no runtime toggle and no UI to leave switched on.
 *
 * Rather than skipping the game logic, both games are fed a *synthetic pitch*
 * at whatever note they are currently asking for. Timing, the release gate,
 * the linger, the tuning tolerance and the scoring all run exactly as they do
 * with a real horn, so what is being tested is still the real thing.
 */
import { midiToNoteName, type PitchReadout } from '../utils/pitchUtils'

export const GAME_TEST_INPUT = import.meta.env.VITE_GAME_TEST_INPUT === '1'

const A4_HZ = 440

/** A dead-centre, perfectly in-tune reading of one MIDI note. */
export function syntheticReadout(midi: number): PitchReadout {
  return {
    noteName: midiToNoteName(midi),
    cents: 0,
    frequencyHz: A4_HZ * 2 ** ((midi - 69) / 12),
    midi,
  }
}

/**
 * Silence.
 *
 * In a test build the microphone is not merely supplemented but replaced: the
 * room's own noise reads as a stream of wrong notes and burns a Staff Jumper
 * run's three hearts within seconds, which is precisely the problem this is
 * meant to solve. Between taps the game is fed this instead.
 */
export const SILENT_READOUT: PitchReadout = {
  noteName: '—',
  cents: 0,
  frequencyHz: 0,
  midi: 0,
}

/**
 * How long a tap keeps sounding.
 *
 * Long enough to clear the game's stability window and its repeated-note gate,
 * short enough that the silence between taps is unambiguous — which is what
 * makes each tap advance exactly one note rather than running away.
 */
export const TEST_TAP_HOLD_MS = 190

/** How often a held press feeds a frame — near the real detector's cadence. */
export const TEST_HOLD_FRAME_MS = 45
