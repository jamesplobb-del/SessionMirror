import type { RefObject } from 'react'
import { useLivePitchTracker } from '../hooks/useLivePitchTracker'
import { INSTRUMENT_RANGE_LABEL } from '../utils/pitchConfig'
import {
  formatFrequencyHz,
  getIntonationColor,
  isInTune,
  type PitchReadout,
} from '../utils/pitchUtils'

interface LivePitchTunerProps {
  mediaRef: RefObject<HTMLMediaElement | null>
  isPlaying: boolean
  mediaKey: string
  takeName?: string
  label?: string
  compact?: boolean
}

function CentsBar({ cents, active }: { cents: number; active: boolean }) {
  const clamped = Math.max(-50, Math.min(50, cents))
  const position = ((clamped + 50) / 100) * 100
  const color = active ? getIntonationColor(cents) : 'rgba(255,255,255,0.25)'

  return (
    <div className="relative mx-auto h-4 w-full max-w-sm overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
      <div className="absolute inset-y-0 left-[20%] w-px bg-emerald-500/20" />
      <div className="absolute inset-y-0 left-[40%] w-px bg-white/10" />
      <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/35" />
      <div className="absolute inset-y-0 left-[60%] w-px bg-white/10" />
      <div className="absolute inset-y-0 left-[80%] w-px bg-emerald-500/20" />
      <div
        className="absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_12px_currentColor] transition-[left,background-color] duration-75"
        style={{ left: `${position}%`, backgroundColor: color, color }}
      />
    </div>
  )
}

function TunerReadout({
  readout,
  takeName,
  label,
  compact = false,
}: {
  readout: PitchReadout
  takeName?: string
  label?: string
  compact?: boolean
}) {
  const active = readout.noteName !== '—'
  const color = active ? getIntonationColor(readout.cents) : 'rgba(255,255,255,0.35)'
  const inTune = active && isInTune(readout.cents)

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-stone-950 via-stone-900 to-black px-4 ${
        compact ? 'gap-3 py-4' : 'gap-6 px-6 py-10'
      }`}
    >
      {label && (
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          {label}
        </p>
      )}

      <div className="flex flex-col items-center gap-1.5">
        <p
          className={`font-mono font-bold tracking-tight tabular-nums ${
            compact ? 'text-4xl' : 'text-6xl sm:text-7xl'
          }`}
          style={{ color: active ? color : undefined }}
        >
          {readout.noteName}
        </p>
        <p
          className={`font-mono tabular-nums text-white/75 ${
            compact ? 'text-xl' : 'text-2xl'
          }`}
        >
          {active ? (
            <>
              {readout.cents >= 0 ? '+' : ''}
              {Math.round(readout.cents)}¢
            </>
          ) : (
            '—'
          )}
        </p>
        <p className="font-mono text-xs text-white/40">
          {formatFrequencyHz(readout.frequencyHz)}
        </p>
      </div>

      <div className="w-full max-w-md space-y-2">
        <CentsBar cents={readout.cents} active={active} />
        <div className="flex justify-between px-1 text-[10px] uppercase tracking-wider text-white/30">
          <span>Flat</span>
          <span className={inTune ? 'text-emerald-400' : ''}>A440</span>
          <span>Sharp</span>
        </div>
      </div>

      {!compact && takeName && (
        <p className="max-w-full truncate text-sm font-medium text-white/55">
          {takeName}
        </p>
      )}

      {!active && (
        <p className="text-center text-xs text-white/35">
          Press play — winds, brass & strings ({INSTRUMENT_RANGE_LABEL})
        </p>
      )}
    </div>
  )
}

export default function LivePitchTuner({
  mediaRef,
  isPlaying,
  mediaKey,
  takeName,
  label = 'Live Pitch Tracker · A440',
  compact = false,
}: LivePitchTunerProps) {
  const readout = useLivePitchTracker(mediaRef, true, isPlaying, mediaKey)

  return (
    <TunerReadout
      readout={readout}
      takeName={takeName}
      label={label}
      compact={compact}
    />
  )
}
