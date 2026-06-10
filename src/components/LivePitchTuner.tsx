import { useRef, type RefObject } from 'react'
import { useLivePitchTracker } from '../hooks/useLivePitchTracker'
import { PITCH_TRACE_COLOR } from '../utils/pitchConfig'
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
  variant?: 'panel' | 'dock' | 'stage'
  enabled?: boolean
}

function CentsNeedle({
  cents,
  active,
  compact = false,
  accentColor,
}: {
  cents: number
  active: boolean
  compact?: boolean
  accentColor?: string
}) {
  const clamped = active ? Math.max(-50, Math.min(50, cents)) : 0
  const position = 50 + clamped
  const dotColor = active
    ? (accentColor ?? getIntonationColor(cents))
    : 'rgba(255,255,255,0.35)'

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-white/8 ${
        compact ? 'h-1' : 'h-1.5'
      }`}
    >
      <div className="absolute inset-y-0 left-[35%] w-[30%] rounded-full bg-sky-400/20" />
      <div className="absolute inset-y-0 left-[22%] w-[56%] rounded-full bg-white/5" />
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_8px_rgba(56,189,248,0.35)] ${
          compact ? 'h-2.5 w-2.5' : 'h-3 w-3'
        }`}
        style={{
          left: `${position}%`,
          backgroundColor: dotColor,
          opacity: active ? 1 : 0.45,
        }}
      />
    </div>
  )
}

function StatusLabel({
  active,
  inTune,
  zone,
  isPlaying,
}: {
  active: boolean
  inTune: boolean
  zone: ReturnType<typeof getIntonationZone> | null
  isPlaying: boolean
}) {
  const text = active
    ? zone === 'green'
      ? 'In tune'
      : zone === 'yellow'
        ? 'Close'
        : 'Adjust'
    : isPlaying
      ? 'Listening'
      : 'Paused'

  return (
    <p
      className={`text-[9px] font-medium uppercase tracking-wider ${
        inTune ? 'text-sky-300/90' : zone === 'yellow' ? 'text-amber-300/80' : 'text-white/35'
      }`}
    >
      {text}
    </p>
  )
}

export default function LivePitchTuner({
  mediaRef,
  isPlaying,
  mediaKey,
  takeName,
  label = 'Pitch Analysis',
  variant = 'panel',
  enabled = true,
}: LivePitchTunerProps) {
  const isPanel = variant === 'panel'
  const isStage = variant === 'stage'
  const canvasTheme = isPanel ? 'glass' : 'solid'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readout = useLivePitchTracker(
    mediaRef,
    enabled,
    isPlaying,
    mediaKey,
    canvasRef,
    canvasTheme,
  )

  const active = readout.noteName !== '—'
  const accent = active
    ? isPanel
      ? PITCH_TRACE_COLOR
      : getIntonationColor(readout.cents)
    : 'rgba(255,255,255,0.55)'
  const inTune = active && isInTune(readout.cents)
  const zone = active ? getIntonationZone(readout.cents) : null
  const spectrogramHeight = isPanel
    ? 'min-h-[5.5rem]'
    : isStage
      ? 'min-h-0 flex-1'
      : 'h-[6.5rem]'

  if (isPanel) {
    return (
      <div className="pitch-tuner pitch-tuner--panel h-full w-full">
        <div className="pitch-glass-panel flex h-full w-full flex-col overflow-hidden">
          <div className={`relative flex-1 overflow-hidden p-5 ${spectrogramHeight}`}>
            <canvas
              ref={canvasRef}
              className="pitch-spectrogram pitch-spectrogram--glass absolute inset-0 h-full w-full"
            />
          </div>

          <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-5 pb-5 pt-3">
            <div className="min-w-[3.25rem] shrink-0">
              <p
                className="font-mono text-xl font-bold leading-none tabular-nums"
                style={{ color: accent }}
              >
                {readout.noteName}
              </p>
              <p className="mt-0.5 font-mono text-[9px] text-white/40">
                {formatFrequencyHz(readout.frequencyHz)}
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <CentsNeedle
                cents={readout.cents}
                active={active}
                compact
                accentColor={PITCH_TRACE_COLOR}
              />
            </div>

            <div className="shrink-0 text-right">
              <p
                className="font-mono text-base font-semibold tabular-nums"
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
              <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isStage) {
    return (
      <div className="pitch-tuner flex h-full w-full flex-col overflow-hidden bg-stone-950">
        <div className="shrink-0 border-b border-white/8 px-5 py-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
                {label}
              </p>
              {takeName && (
                <p className="mt-0.5 truncate text-sm text-white/50">{takeName}</p>
              )}
              <p
                className="mt-2 font-mono text-6xl font-bold leading-none tabular-nums sm:text-7xl"
                style={{ color: accent }}
              >
                {readout.noteName}
              </p>
              <p className="mt-1.5 font-mono text-xs text-white/35">
                {formatFrequencyHz(readout.frequencyHz)}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className="font-mono text-3xl font-semibold tabular-nums"
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
              <div className="mt-1.5">
                <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <CentsNeedle cents={readout.cents} active={active} />
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-white/25">
              <span>-50</span>
              <span className="text-emerald-400/60">0</span>
              <span>+50</span>
            </div>
          </div>
        </div>

        <div className={`relative overflow-hidden ${spectrogramHeight}`}>
          <canvas ref={canvasRef} className="pitch-spectrogram absolute inset-0 h-full w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="pitch-tuner flex h-full w-full flex-col overflow-hidden bg-stone-950/95">
      <div className="shrink-0 border-b border-white/8 px-4 py-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              {label}
            </p>
            {takeName && (
              <p className="mt-0.5 truncate text-xs text-white/45">{takeName}</p>
            )}
            <p
              className="mt-1 font-mono text-5xl font-bold leading-none tabular-nums"
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
              className="font-mono text-2xl font-semibold tabular-nums"
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
            <div className="mt-1">
              <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <CentsNeedle cents={readout.cents} active={active} />
          <div className="mt-1 flex justify-between font-mono text-[9px] text-white/25">
            <span>-50</span>
            <span className="text-emerald-400/60">0</span>
            <span>+50</span>
          </div>
        </div>
      </div>

      <div className={`relative shrink-0 overflow-hidden ${spectrogramHeight}`}>
        <canvas ref={canvasRef} className="pitch-spectrogram absolute inset-0 h-full w-full" />
      </div>

      {!active && !isPlaying && (
        <p className="shrink-0 py-2 text-center text-[11px] text-white/30">
          Tap play to analyze pitch
        </p>
      )}
    </div>
  )
}
