import { useEffect, type RefObject } from 'react'
import { getTunerWashTarget, type TunerWashTarget } from '../utils/pitchUtils'

const WASH_VARS = [
  '--tuner-ui-hue',
  '--tuner-ui-strength',
  '--tuner-ui-feather-strength',
  '--tuner-ui-dark-strength',
  '--tuner-center-strength',
  '--tuner-rim-strength',
  '--tuner-rim-glow-strength',
  '--tuner-rim-spread',
  '--pitch-stage-hue',
] as const

function applyWash(el: HTMLElement | null, wash: TunerWashTarget) {
  if (!el) return
  el.style.setProperty('--tuner-ui-hue', wash.hue)
  el.style.setProperty('--tuner-ui-strength', `${wash.strength}%`)
  el.style.setProperty('--tuner-ui-feather-strength', `${wash.feather}%`)
  el.style.setProperty('--tuner-ui-dark-strength', `${wash.darkStrength}%`)
  el.style.setProperty('--tuner-center-strength', `${wash.center}%`)
  el.style.setProperty('--tuner-rim-strength', `${wash.rim}%`)
  el.style.setProperty('--tuner-rim-glow-strength', `${wash.rimGlow}%`)
  el.style.setProperty('--tuner-rim-spread', `${wash.rimSpread}px`)
  el.style.setProperty('--pitch-stage-hue', wash.hue)
}

function clearWash(el: HTMLElement | null) {
  if (!el) return
  for (const name of WASH_VARS) el.style.removeProperty(name)
}

/**
 * Eases the tuner page tint along the live line color so zone changes fade
 * through amber instead of snapping green ↔ red.
 */
export function useTunerWash(
  stageRef: RefObject<HTMLElement | null>,
  cents: number | null,
  inTuneGlow: number,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return
    const target = getTunerWashTarget(cents, inTuneGlow)
    applyWash(stageRef.current, target)
    const overlay = stageRef.current?.closest<HTMLElement>('.app-ui-overlay--audio-practice-tuner')
    if (overlay) {
      applyWash(overlay, target)
      applyWash(document.documentElement, target)
    }
  }, [cents, enabled, inTuneGlow, stageRef])

  useEffect(() => {
    if (!enabled) return
    return () => {
      const stage = stageRef.current
      const overlay = stage?.closest<HTMLElement>('.app-ui-overlay--audio-practice-tuner')
      clearWash(stage)
      clearWash(overlay ?? null)
      if (overlay) clearWash(document.documentElement)
    }
  }, [enabled, stageRef])
}
