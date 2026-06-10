import { useRef, type RefObject } from 'react'
import { useLivePitchTracker } from '../hooks/useLivePitchTracker'
import {
  formatFrequencyHz,
  getIntonationColor,
  getIntonationZone,
  isInTune,
} from '../utils/pitchUtils'

interface LivePitchTunerProps {
  mediaRef: RefObject<HTMLMediaElement | null>
  isPlaying: boolean
  mediaKey: string
  takeName?: string
  label?: string
  variant?: 'full' | 'panel'
}

function CentsNeedle({ cents, active }: { cents: number; active: boolean }) {
  const clamped = active ? Math.max(-50, Math.min(50, cents)) : 0
  const position = 50 + clamped

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div className="absolute inset-y-0 left-[35%] w-[30%] rounded-full bg-emerald-400/25" />
      <div className="absolute inset-y-0 left-[22%] w-[56%] rounded-full bg-amber-400/10" />
      <div
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_10px_rgba(255,255,255,0.35)] transition-[left] duration-75 ease-out"
        style={{
          left: `${position}%`,
          backgroundColor: active ? getIntonationColor(cents) : 'rgba(255,255,255,0.35)',
          opacity: active ? 1 : 0.45,
        }}
      />
    </div>
  )
}

export default function LivePitchTuner({
  mediaRef,
  isPlaying,
  mediaKey,
  takeName,
  label = 'Pitch Analysis',
  variant = 'full',
}: LivePitchTunerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readout = useLivePitchTracker(
    mediaRef,
    true,
    isPlaying,
    mediaKey,
    canvasRef,
  )

  const active = readout.noteName !== '—'
  const accent = active ? getIntonationColor(readout.cents) : 'rgba(255,255,255,0.55)'
  const inTune = active && isInTune(readout.cents)
  const isPanel = variant === 'panel'
  const zone = active ? getIntonationZone(readout.cents) : null

  return (
    <div
      className={`pitch-tuner flex h-full w-full flex-col overflow-hidden ${
        isPanel ? 'bg-stone-950/90' : 'bg-stone-950'
      }`}
    >
      <div
        className={`relative shrink-0 ${
          isPanel
            ? 'border-b border-white/8 px-4 py-2.5'
            : 'border-b border-white/8 px-5 pb-3 pt-[max(3.75rem,calc(env(safe-area-inset-top)+2.75rem))]'
        }`}
      >
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            {!isPanel && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                {label}
              </p>
            )}
            {takeName && !isPanel && (
              <p className="mt-0.5 truncate text-xs text-white/50">{takeName}</p>
            )}
            <p
              className={`font-mono font-bold leading-none tracking-tight tabular-nums ${
                isPanel ? 'text-4xl' : 'text-6xl sm:text-7xl'
              } ${isPanel ? '' : 'mt-1'}`}
              style={{ color: accent }}
            >
              {readout.noteName}
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/35">
              {formatFrequencyHz(readout.frequencyHz)}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p
              className={`font-mono font-semibold tabular-nums ${
                isPanel ? 'text-2xl' : 'text-3xl'
              }`}
              style={{ color: accent }}
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
            <p
              className={`mt-1 text-[10px] font-medium uppercase tracking-wider ${
                inTune ? 'text-emerald-400/90' : zone === 'yellow' ? 'text-amber-300/80' : 'text-white/30'
              }`}
            >
              {active
                ? zone === 'green'
                  ? 'In tune'
                  : zone === 'yellow'
                    ? 'Close'
                    : 'Adjust'
                : isPlaying
                  ? 'Listening'
                  : 'Paused'}
            </p>
          </div>
        </div>

        <div className={`${isPanel ? 'mt-2.5' : 'mt-4'}`}>
          <CentsNeedle cents={readout.cents} active={active} />
          <div className="mt-1 flex justify-between font-mono text-[9px] text-white/25">
            <span>-50</span>
            <span className="text-emerald-400/60">0</span>
            <span>+50</span>
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="pitch-spectrogram absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-stone-950/80 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between px-3 pb-2 pt-6 text-[9px] font-medium uppercase tracking-[0.18em] text-white/25">
          <span>Pitch trace</span>
          <span className="text-sky-400/50">A440</span>
        </div>
      </div>

      {!active && !isPlaying && (
        <p className="shrink-0 border-t border-white/6 py-2.5 text-center text-[11px] text-white/30">
          Tap play to analyze pitch
        </p>
      )}
    </div>
  )
}
