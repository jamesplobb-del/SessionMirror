import { useEffect, useRef, type RefObject } from 'react'
import { IDLE_TUNER_WASH, type TunerWashTarget } from '../utils/pitchUtils'
import { getRecordWashTarget, type RecordWashMode } from '../utils/recordWash'

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

const OVERLAY_SELECTOR = '.app-ui-overlay--audio-practice-record'

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
 * Eases the Record page tint with the same wash plumbing as the tuner, driven
 * by recording / playback state and live mic energy instead of cents.
 */
export function useRecordWash(
  stageRef: RefObject<HTMLElement | null>,
  mode: RecordWashMode,
  energy: number,
  enabled: boolean,
) {
  const modeRef = useRef(mode)
  const energyRef = useRef(energy)
  modeRef.current = mode
  energyRef.current = energy

  useEffect(() => {
    if (!enabled) return

    const current = { ...IDLE_TUNER_WASH }
    let hue = hexToRgb(current.hue) ?? { r: 21, g: 152, b: 255 }
    let last = performance.now()
    let frame = 0

    applyWash(stageRef.current, current)
    const overlay = stageRef.current?.closest<HTMLElement>(OVERLAY_SELECTOR)
    if (overlay) {
      applyWash(overlay, current)
      applyWash(document.documentElement, current)
    }

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const target = getRecordWashTarget(modeRef.current, energyRef.current)
      const targetHue = hexToRgb(target.hue) ?? hue
      hue = {
        r: toward(hue.r, targetHue.r, dt, 0.45),
        g: toward(hue.g, targetHue.g, dt, 0.45),
        b: toward(hue.b, targetHue.b, dt, 0.45),
      }
      current.hue = rgbToHex(hue)
      current.strength = toward(current.strength, target.strength, dt, 0.45)
      current.feather = toward(current.feather, target.feather, dt, 0.45)
      current.darkStrength = toward(current.darkStrength, target.darkStrength, dt, 0.45)
      current.center = toward(current.center, target.center, dt, 0.45)
      current.rim = toward(current.rim, target.rim, dt, 0.45)
      current.rimGlow = toward(current.rimGlow, target.rimGlow, dt, 0.45)
      current.rimSpread = toward(current.rimSpread, target.rimSpread, dt, 0.45)

      const stage = stageRef.current
      applyWash(stage, current)
      const nextOverlay = stage?.closest<HTMLElement>(OVERLAY_SELECTOR)
      if (nextOverlay) {
        applyWash(nextOverlay, current)
        applyWash(document.documentElement, current)
      } else {
        clearWash(document.documentElement)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      const stage = stageRef.current
      const nextOverlay = stage?.closest<HTMLElement>(OVERLAY_SELECTOR)
      clearWash(stage)
      clearWash(nextOverlay ?? null)
      clearWash(document.documentElement)
    }
  }, [enabled, stageRef])
}
