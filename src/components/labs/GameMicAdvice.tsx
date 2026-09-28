import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { TunerInputAdvice } from '../../utils/tunerInputAdvice'

/*
 * Detection trouble in a practice game. Each game's pitch tracker reports it;
 * the Practice Games overlay shows one banner for whichever game is open, so
 * a struggling microphone (an iPad across the room, a soft first note, a
 * noisy practice room) never leaves the player waiting on a game that can't
 * hear them.
 */
let current: TunerInputAdvice = null
const listeners = new Set<() => void>()
function publish(next: TunerInputAdvice) {
  if (next === current) return
  current = next
  listeners.forEach(listener => listener())
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** Pass the result as a game tracker's `onInputAdvice`. Clears when the game unmounts. */
export function useGameMicAdviceReporter(): (advice: TunerInputAdvice) => void {
  useEffect(() => () => publish(null), [])
  return useCallback((advice: TunerInputAdvice) => publish(advice), [])
}

const MESSAGES: Record<Exclude<TunerInputAdvice, null>, string> = {
  quiet: 'Your note is coming in quietly. Play a little louder or move closer to the mic.',
  unpitched: 'Hearing sound but no clear pitch. Try a steady tone, away from background noise.',
  loud: 'The input is very loud. Move back a little from the mic.',
}

export function GameMicAdviceBanner() {
  const advice = useSyncExternalStore(subscribe, () => current, () => null)
  const [dismissed, setDismissed] = useState<TunerInputAdvice[]>([])
  if (!advice || dismissed.includes(advice)) return null
  return (
    <div className="tuner-input-advice tuner-input-advice--game" role="status">
      <span>{MESSAGES[advice]}</span>
      <button type="button" aria-label="Dismiss microphone tip" onClick={() => setDismissed(list => [...list, advice])}>✕</button>
    </div>
  )
}
