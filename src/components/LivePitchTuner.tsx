import { AnimatePresence, motion } from 'framer-motion'
import { useRef, type RefObject } from 'react'
import { useLivePitchTracker } from '../hooks/useLivePitchTracker'
import {
  formatDisplayCents,
  formatFrequencyHz,
  frequencyToPitchReadout,
  getIntonationColor,
  getIntonationZone,
  isInTune,
  type PitchReadout,
} from '../utils/pitchUtils'
import type { TunerInstrument } from '../utils/pitchConfig'

interface LivePitchTunerProps {
  mediaRef: RefObject<HTMLMediaElement | null>
  isPlaying: boolean
  mediaKey: string
  takeName?: string
  label?: string
  variant?: 'panel' | 'dock' | 'stage' | 'widget' | 'audio'
  enabled?: boolean
  liveMicEnabled?: boolean
  micStreamRef?: RefObject<MediaStream | null>
  persistWhenPaused?: boolean
  tunerInstrument?: TunerInstrument
}

function PitchChartCanvas({
  canvasRef,
  glass = false,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  glass?: boolean
}) {
  return (
    <div className="pitch-chart-shell relative w-full flex-1" style={{ minHeight: 140, height: '100%' }}>
      <canvas
        ref={canvasRef}
        className={`pitch-spectrogram absolute inset-0 h-full w-full ${
          glass ? 'pitch-spectrogram--glass' : ''
        }`}
        style={{ minHeight: 140 }}
      />
    </div>
  )
}

function CentsNeedle({
  cents,
  active,
  compact = false,
  large = false,
}: {
  cents: number
  active: boolean
  compact?: boolean
  large?: boolean
}) {
  const clamped = active ? Math.max(-50, Math.min(50, cents)) : 0
  const position = 50 + clamped
  const dotColor = active ? getIntonationColor(cents) : 'rgba(255,255,255,0.35)'

  return (
    <div
      className={`relative w-full overflow-hidden rounded-full bg-white/8 ${
        large ? 'h-2' : compact ? 'h-1' : 'h-1.5'
      }`}
    >
      <div className="absolute inset-y-0 left-[35%] w-[30%] rounded-full bg-emerald-400/20" />
      <div className="absolute inset-y-0 left-[22%] w-[56%] rounded-full bg-amber-400/10" />
      <div
        className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_8px_rgba(255,255,255,0.25)] ${
          large ? 'h-4 w-4' : compact ? 'h-2.5 w-2.5' : 'h-3 w-3'
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
        inTune ? 'text-emerald-400/90' : zone === 'yellow' ? 'text-amber-300/80' : 'text-white/30'
      }`}
    >
      {text}
    </p>
  )
}

function AudioTunerPane({
  readout,
  canvasRef,
  mode,
  takeName,
  isPlaying,
}: {
  readout: ReturnType<typeof useLivePitchTracker>
  canvasRef: RefObject<HTMLCanvasElement | null>
  mode: 'live' | 'playback' | 'idle'
  takeName?: string
  isPlaying: boolean
}) {
  const active = readout.noteName !== '—'
  const displayCents = active ? readout.cents : 0
  const accent = active ? getIntonationColor(displayCents) : 'rgba(255,255,255,0.55)'
  const inTune = active && isInTune(readout.cents)
  const zone = active ? getIntonationZone(readout.cents) : null
  const modeLabel =
    mode === 'live' ? 'Live Tuner' : mode === 'playback' ? 'Recorded Take' : 'Pitch Analysis'

  return (
    <div className="pitch-audio-pane flex min-h-0 flex-1 flex-col">
      <div className="pitch-audio-pane__header">
        <div className="min-w-0">
          <p className="pitch-audio-pane__eyebrow">{modeLabel}</p>
          {takeName && mode === 'playback' && (
            <p className="pitch-audio-pane__take-name">{takeName}</p>
          )}
        </div>
        <div className="pitch-audio-pane__status-pill">
          <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
        </div>
      </div>

      <div className="pitch-audio-pane__readout">
        <p className="pitch-audio-pane__note font-mono tabular-nums" style={{ color: accent }}>
          {readout.noteName}
        </p>
        <div className="pitch-audio-pane__meta">
          <p
            className="pitch-audio-pane__meta-freq font-mono tabular-nums"
            style={{ color: accent }}
          >
            {formatFrequencyHz(readout.frequencyHz)}
          </p>
          <p className="pitch-audio-pane__cents font-mono tabular-nums" style={{ color: accent }}>
            {active ? formatDisplayCents(readout.cents) : '—'}
          </p>
        </div>
      </div>

      <div className="pitch-audio-pane__needle">
        {active ? (
          <CentsNeedle cents={displayCents} active={active} large />
        ) : (
          <CentsNeedle cents={0} active={false} large />
        )}
        <div className="mt-2 flex justify-between font-mono text-[10px] text-white/28">
          <span>Flat</span>
          <span className="text-emerald-400/70">In tune</span>
          <span>Sharp</span>
        </div>
      </div>

      {mode === 'idle' ? (
        <div className="pitch-audio-pane__idle flex flex-1 items-center justify-center text-center">
          <p className="max-w-xs text-sm leading-relaxed text-white/40">
            Enable Live Mic Tuner in Settings to practice with a live tuner, or press play to analyze
            this take.
          </p>
        </div>
      ) : (
        <div className="pitch-audio-pane__chart-well mt-4 min-h-[140px] flex-1">
          <PitchChartCanvas canvasRef={canvasRef} glass />
        </div>
      )}
    </div>
  )
}

const IDLE_PITCH_READOUT: PitchReadout = frequencyToPitchReadout(0)

function LivePitchTunerAudio({
  mediaRef,
  isPlaying,
  mediaKey,
  takeName,
  enabled,
  liveMicEnabled,
  micStreamRef,
  tunerInstrument = 'voice',
}: {
  mediaRef: RefObject<HTMLMediaElement | null>
  isPlaying: boolean
  mediaKey: string
  takeName?: string
  enabled: boolean
  liveMicEnabled: boolean
  micStreamRef?: RefObject<MediaStream | null>
  tunerInstrument?: TunerInstrument
}) {
  const liveCanvasRef = useRef<HTMLCanvasElement>(null)
  const playbackCanvasRef = useRef<HTMLCanvasElement>(null)
  const idleCanvasRef = useRef<HTMLCanvasElement>(null)

  const showLive = !isPlaying && liveMicEnabled
  const showPlayback = isPlaying

  const liveReadout = useLivePitchTracker(
    mediaRef,
    enabled && showLive,
    showLive,
    `live-mic-${mediaKey}`,
    liveCanvasRef,
    'glass',
    { source: 'microphone', micStreamRef, continuousScroll: true, tunerInstrument },
  )

  const playbackReadout = useLivePitchTracker(
    mediaRef,
    enabled && showPlayback,
    showPlayback,
    `${mediaKey}-playback`,
    playbackCanvasRef,
    'glass',
    { source: 'media', persistWhenPaused: true, tunerInstrument },
  )

  const paneKey = showPlayback ? 'playback' : showLive ? 'live' : 'idle'

  return (
    <div className="pitch-tuner pitch-tuner--audio flex h-full min-h-0 w-full flex-col items-center justify-center">
      <div className="pitch-glass-panel pitch-glass-panel--audio flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={paneKey}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {showPlayback ? (
              <AudioTunerPane
                readout={playbackReadout}
                canvasRef={playbackCanvasRef}
                mode="playback"
                takeName={takeName}
                isPlaying={isPlaying}
              />
            ) : showLive ? (
              <AudioTunerPane
                readout={liveReadout}
                canvasRef={liveCanvasRef}
                mode="live"
                isPlaying={isPlaying}
              />
            ) : (
              <AudioTunerPane
                readout={IDLE_PITCH_READOUT}
                canvasRef={idleCanvasRef}
                mode="idle"
                isPlaying={isPlaying}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
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
  liveMicEnabled = true,
  micStreamRef,
  persistWhenPaused = false,
  tunerInstrument = 'voice',
}: LivePitchTunerProps) {
  const isPanel = variant === 'panel'
  const isWidget = variant === 'widget'
  const isAudio = variant === 'audio'
  const isStage = variant === 'stage'
  const canvasTheme = isPanel || isWidget || isAudio ? 'glass' : 'solid'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const readout = useLivePitchTracker(
    mediaRef,
    enabled && !isAudio,
    isPlaying,
    mediaKey,
    canvasRef,
    canvasTheme,
    { source: 'media', persistWhenPaused: isWidget && persistWhenPaused, tunerInstrument },
  )

  if (isAudio) {
    return (
      <LivePitchTunerAudio
        mediaRef={mediaRef}
        isPlaying={isPlaying}
        mediaKey={mediaKey}
        takeName={takeName}
        enabled={enabled}
        liveMicEnabled={liveMicEnabled}
        micStreamRef={micStreamRef}
        tunerInstrument={tunerInstrument}
      />
    )
  }

  const active = readout.noteName !== '—'
  const displayCents = active ? readout.cents : 0
  const accent = active ? getIntonationColor(displayCents) : 'rgba(255,255,255,0.55)'
  const inTune = active && isInTune(readout.cents)
  const zone = active ? getIntonationZone(readout.cents) : null
  const spectrogramHeight = isStage
    ? 'min-h-0 flex-1'
    : 'h-[6.5rem]'

  if (isWidget) {
    return (
      <div
        className="pitch-tuner pitch-tuner--widget h-full w-full"
        style={{ height: 188, minHeight: 188 }}
      >
        <div
          className="pitch-glass-panel pitch-glass-panel--compact flex w-full flex-col overflow-hidden"
          style={{ height: 188, minHeight: 188 }}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-3 pt-2.5 pb-1 pr-10">
            <p
              className="font-mono text-base font-bold leading-none tabular-nums tracking-tight"
              style={{ color: accent }}
            >
              {readout.noteName}
              {active && (
                <span className="ml-1.5 text-sm font-semibold">
                  {active ? formatDisplayCents(readout.cents) : '—'}
                </span>
              )}
            </p>
            <p
              className="shrink-0 font-mono text-xs font-semibold tabular-nums"
              style={{ color: accent }}
            >
              {formatFrequencyHz(readout.frequencyHz)}
            </p>
          </div>

          <div
            className="relative shrink-0 overflow-hidden px-3 pb-2.5"
            style={{ height: 140, minHeight: 140 }}
          >
            <PitchChartCanvas canvasRef={canvasRef} glass />
            {!active && !isPlaying && (
              <p className="pointer-events-none absolute inset-x-3 bottom-2 text-center text-[10px] text-white/35">
                Pitch trace during playback
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (isPanel) {
    return (
      <div className="pitch-tuner pitch-tuner--panel h-full w-full">
        <div className="pitch-glass-panel flex h-full min-h-[9.5rem] w-full flex-col overflow-hidden">
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-2">
            <div className="min-w-0">
              <p
                className="font-mono text-2xl font-bold leading-none tabular-nums tracking-tight"
                style={{ color: accent }}
              >
                {readout.noteName}
                {active && (
                  <span className="ml-2 text-lg font-semibold">
                    {formatDisplayCents(readout.cents)}
                  </span>
                )}
              </p>
            </div>
            <p
              className="shrink-0 font-mono text-sm font-bold tabular-nums"
              style={{ color: accent }}
            >
              {formatFrequencyHz(readout.frequencyHz)}
            </p>
          </div>

          <div className="relative min-h-[5rem] flex-1 overflow-hidden px-5 pb-5">
            <PitchChartCanvas canvasRef={canvasRef} glass />
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
                {active ? formatDisplayCents(readout.cents) : '—'}
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
              {active ? formatDisplayCents(readout.cents) : '—'}
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
