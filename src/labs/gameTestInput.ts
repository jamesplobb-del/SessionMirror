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
import { useSyncExternalStore } from 'react'
import { midiToNoteName, type PitchReadout } from '../utils/pitchUtils'

/**
 * Whether this build carries the feature at all. Still purely build-time, so an
 * ordinary build drops every branch below as dead code and ships no toggle.
 */
export const GAME_TEST_INPUT_AVAILABLE = import.meta.env.VITE_GAME_TEST_INPUT === '1'

/**
 * ...and whether touch is standing in for the instrument *right now*.
 *
 * Because a test build replaces the microphone rather than supplementing it,
 * a single build-time constant meant choosing between testing the games and
 * playing them, with a full rebuild to change your mind. This splits that:
 * the build decides whether the switch exists, the switch decides which input
 * is live, and the choice survives a relaunch. Release builds are unaffected —
 * `GAME_TEST_INPUT_AVAILABLE` is false there, so this is all eliminated.
 */
const STORAGE_KEY = 'besttake.game-test-input.v1'

function readSavedMode(): boolean {
  if (!GAME_TEST_INPUT_AVAILABLE) return false
  // Default on: a build made with the flag is a build made to test with.
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'instrument'
  } catch {
    return true
  }
}

let touchInputOn = readSavedMode()
const listeners = new Set<() => void>()

export function isGameTestInputOn(): boolean {
  return touchInputOn
}

export function setGameTestInputOn(on: boolean): void {
  if (!GAME_TEST_INPUT_AVAILABLE || on === touchInputOn) return
  touchInputOn = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'touch' : 'instrument')
  } catch {
    /* storage may be unavailable */
  }
  for (const listener of listeners) listener()
}

function subscribeGameTestInput(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Live in a component: re-renders when the player switches input. */
export function useGameTestInput(): boolean {
  return useSyncExternalStore(subscribeGameTestInput, isGameTestInputOn, () => false)
}

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
