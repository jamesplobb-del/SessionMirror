import { useEffect, useRef, type RefObject } from 'react'
import {
  getTunerWashTarget,
  IDLE_TUNER_WASH,
  type TunerWashTarget,
} from '../utils/pitchUtils'

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

function toward(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / Math.max(0.04, tau)))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const value = Number.parseInt(match[1], 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function rgbToHex(color: { r: number; g: number; b: number }): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

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
  const centsRef = useRef(cents)
  const glowRef = useRef(inTuneGlow)
  centsRef.current = cents
  glowRef.current = inTuneGlow

  useEffect(() => {
    if (!enabled) return

    const current = { ...IDLE_TUNER_WASH }
    let hue = hexToRgb(current.hue) ?? { r: 21, g: 152, b: 255 }
    let last = performance.now()
    let frame = 0

    applyWash(stageRef.current, current)
    const overlay = stageRef.current?.closest<HTMLElement>('.app-ui-overlay--audio-practice-tuner')
    if (overlay) {
      applyWash(overlay, current)
      applyWash(document.documentElement, current)
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const target = getTunerWashTarget(centsRef.current, glowRef.current)
      const targetHue = hexToRgb(target.hue) ?? hue
      hue = {
        r: toward(hue.r, targetHue.r, dt, 0.55),
        g: toward(hue.g, targetHue.g, dt, 0.55),
        b: toward(hue.b, targetHue.b, dt, 0.55),
      }
      current.hue = rgbToHex(hue)
      current.strength = toward(current.strength, target.strength, dt, 0.55)
      current.feather = toward(current.feather, target.feather, dt, 0.55)
      current.darkStrength = toward(current.darkStrength, target.darkStrength, dt, 0.55)
      current.center = toward(current.center, target.center, dt, 0.55)
      current.rim = toward(current.rim, target.rim, dt, 0.55)
      current.rimGlow = toward(current.rimGlow, target.rimGlow, dt, 0.55)
      current.rimSpread = toward(current.rimSpread, target.rimSpread, dt, 0.55)

      const stage = stageRef.current
      applyWash(stage, current)
      const overlay = stage?.closest<HTMLElement>('.app-ui-overlay--audio-practice-tuner')
      if (overlay) {
        applyWash(overlay, current)
        applyWash(document.documentElement, current)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      const stage = stageRef.current
      const overlay = stage?.closest<HTMLElement>('.app-ui-overlay--audio-practice-tuner')
      clearWash(stage)
      clearWash(overlay ?? null)
      if (overlay) clearWash(document.documentElement)
    }
  }, [enabled, stageRef])
}
