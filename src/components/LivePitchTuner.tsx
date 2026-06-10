import { AnimatePresence, motion } from 'framer-motion'
import { useRef, type RefObject } from 'react'
import { useLivePitchTracker } from '../hooks/useLivePitchTracker'
import {
  formatDisplayCents,
  formatFrequencyHz,
  getIntonationColor,
  getIntonationZone,
  isInTune,
  TUNING_GREEN_CENTS,
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
      className={`pitch-needle-rail relative w-full overflow-hidden ${
        large ? 'pitch-needle-rail--large' : compact ? 'pitch-needle-rail--compact' : ''
      }`}
    >
      <div className="absolute inset-y-0 left-[35%] w-[30%] rounded-full bg-emerald-400/14" />
      <div className="absolute inset-y-0 left-[22%] w-[56%] rounded-full bg-amber-400/8" />
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
      className={`pitch-status-label ${inTune ? 'pitch-status-label--in-tune' : zone === 'yellow' ? 'pitch-status-label--close' : zone === 'red' ? 'pitch-status-label--adjust' : ''}`}
    >
      {text}
    </p>
  )
}

function VerticalPitchMeter({
  cents,
  active,
}: {
  cents: number
  active: boolean
}) {
  const clamped = active ? Math.max(-50, Math.min(50, cents)) : 0
  const inTune = active && isInTune(cents, TUNING_GREEN_CENTS)
  const zone = active ? getIntonationZone(cents) : null
  const color = active ? getIntonationColor(cents) : 'rgba(255,255,255,0.18)'
  const fillRatio = active ? Math.abs(clamped) / 50 : 0
  const isSharp = active && clamped > TUNING_GREEN_CENTS
  const isFlat = active && clamped < -TUNING_GREEN_CENTS
  const pulseDuration = zone === 'red' ? 0.38 : zone === 'yellow' ? 0.58 : 0.85

  return (
    <div
      className={`pitch-vertical-meter ${active ? 'pitch-vertical-meter--active' : ''} ${inTune ? 'pitch-vertical-meter--in-tune' : ''}`}
      aria-hidden={!active}
    >
      <div className="pitch-vertical-meter__track">
        <div className="pitch-vertical-meter__band" aria-hidden>
          <span className="pitch-vertical-meter__band-zone" />
          <span className="pitch-vertical-meter__band-line pitch-vertical-meter__band-line--high" />
          <span className="pitch-vertical-meter__band-line pitch-vertical-meter__band-line--low" />
        </div>

        <div className="pitch-vertical-meter__zone pitch-vertical-meter__zone--sharp">
          {isSharp && (
            <motion.div
              className="pitch-vertical-meter__fill"
              style={{
                height: `${fillRatio * 100}%`,
                backgroundColor: color,
                ['--meter-glow' as string]: color,
              }}
              initial={false}
              animate={{
                opacity: [0.72, 1, 0.72],
                scaleX: zone === 'red' ? [0.92, 1.06, 0.92] : [0.96, 1, 0.96],
              }}
              transition={{
                duration: pulseDuration,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </div>

        <div
          className={`pitch-vertical-meter__center ${inTune ? 'pitch-vertical-meter__center--in-tune' : ''}`}
          style={!inTune && active ? { borderColor: `${color}55` } : undefined}
        />

        <div className="pitch-vertical-meter__zone pitch-vertical-meter__zone--flat">
          {isFlat && (
            <motion.div
              className="pitch-vertical-meter__fill"
              style={{
                height: `${fillRatio * 100}%`,
                backgroundColor: color,
                ['--meter-glow' as string]: color,
              }}
              initial={false}
              animate={{
                opacity: [0.72, 1, 0.72],
                scaleX: zone === 'red' ? [0.92, 1.06, 0.92] : [0.96, 1, 0.96],
              }}
              transition={{
                duration: pulseDuration,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const SHARP_ORBIT_ANGLES = [-118, -104, -90, -76, -62]
const FLAT_ORBIT_ANGLES = [62, 76, 90, 104, 118]

function NoteOrbitReadout({
  noteName,
  frequencyHz,
  cents,
  active,
}: {
  noteName: string
  frequencyHz: number
  cents: number
  active: boolean
}) {
  const inTune = active && isInTune(cents, TUNING_GREEN_CENTS)
  const zone = active ? getIntonationZone(cents) : null
  const accent = active ? getIntonationColor(cents) : 'rgba(255,255,255,0.55)'
  const isSharp = active && cents > TUNING_GREEN_CENTS
  const isFlat = active && cents < -TUNING_GREEN_CENTS
  const pulseDuration = zone === 'red' ? 0.38 : zone === 'yellow' ? 0.58 : 0.85
  const readoutGlow = active ? `0 0 28px ${accent}44` : 'none'

  return (
    <div
      className={`pitch-note-orbit ${inTune ? 'pitch-note-orbit--in-tune' : ''} ${isSharp ? 'pitch-note-orbit--sharp' : ''} ${isFlat ? 'pitch-note-orbit--flat' : ''}`}
      style={{ ['--orbit-accent' as string]: accent }}
    >
      <div className="pitch-note-orbit__rays" aria-hidden>
        {isSharp &&
          SHARP_ORBIT_ANGLES.map((angle, index) => (
            <motion.span
              key={`sharp-${angle}`}
              className="pitch-note-orbit__ray pitch-note-orbit__ray--sharp"
              style={{ ['--ray-angle' as string]: `${angle}deg` }}
              initial={false}
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -7, 0] }}
              transition={{
                duration: pulseDuration,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: index * 0.07,
              }}
            />
          ))}
        {isFlat &&
          FLAT_ORBIT_ANGLES.map((angle, index) => (
            <motion.span
              key={`flat-${angle}`}
              className="pitch-note-orbit__ray pitch-note-orbit__ray--flat"
              style={{ ['--ray-angle' as string]: `${angle}deg` }}
              initial={false}
              animate={{ opacity: [0.35, 1, 0.35], y: [0, 7, 0] }}
              transition={{
                duration: pulseDuration,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: index * 0.07,
              }}
            />
          ))}
      </div>

      <div className="pitch-note-orbit__ring">
        <svg className="pitch-note-orbit__svg" viewBox="0 0 200 200" aria-hidden>
          <circle className="pitch-note-orbit__ring-track" cx="100" cy="100" r="93" />
          <circle
            className={`pitch-note-orbit__ring-glow ${inTune ? 'pitch-note-orbit__ring-glow--in-tune' : active ? 'pitch-note-orbit__ring-glow--active' : ''}`}
            cx="100"
            cy="100"
            r="93"
            style={!inTune && active ? { stroke: accent } : undefined}
          />
        </svg>

        <div className="pitch-note-orbit__core">
          <p
            className="pitch-note-orbit__note pitch-readout-display"
            style={{ color: accent, textShadow: readoutGlow }}
          >
            {noteName}
          </p>
          <div className="pitch-note-orbit__meta pitch-readout-display">
            <span style={{ color: accent }}>{formatFrequencyHz(frequencyHz)}</span>
            <span className="pitch-note-orbit__sep" aria-hidden>
              ·
            </span>
            <span style={{ color: accent }}>
              {active ? formatDisplayCents(cents) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LiveAudioTunerPane({
  readout,
  canvasRef,
}: {
  readout: ReturnType<typeof useLivePitchTracker>
  canvasRef: RefObject<HTMLCanvasElement | null>
}) {
  const active = readout.noteName !== '—'
  const displayCents = active ? readout.cents : 0

  return (
    <div className="pitch-audio-stage flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pitch-audio-stage__hero">
        <NoteOrbitReadout
          noteName={readout.noteName}
          frequencyHz={readout.frequencyHz}
          cents={displayCents}
          active={active}
        />
      </div>

      <div className="pitch-audio-stage__meter">
        <VerticalPitchMeter cents={displayCents} active={active} />
      </div>

      <div className="pitch-audio-stage__chart min-h-[120px] flex-1">
        <PitchChartCanvas canvasRef={canvasRef} glass />
      </div>
    </div>
  )
}

function AudioTunerPane({
  readout,
  canvasRef,
  mode,
  takeName,
}: {
  readout: ReturnType<typeof useLivePitchTracker>
  canvasRef: RefObject<HTMLCanvasElement | null>
  mode: 'playback'
  takeName?: string
}) {
  const active = readout.noteName !== '—'
  const displayCents = active ? readout.cents : 0
  const accent = active ? getIntonationColor(displayCents) : 'rgba(255,255,255,0.55)'
  const modeLabel =
    mode === 'playback' ? 'Recorded Take' : 'Pitch Analysis'

  return (
    <div className="pitch-audio-pane flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pitch-audio-pane__header">
        <div className="min-w-0">
          <p className="pitch-audio-pane__eyebrow">{modeLabel}</p>
          {takeName && mode === 'playback' && (
            <p className="pitch-audio-pane__take-name">{takeName}</p>
          )}
        </div>
      </div>

      <div className="pitch-audio-pane__readout">
        <p className="pitch-audio-pane__note pitch-readout-display" style={{ color: accent }}>
          {readout.noteName}
        </p>
        <div className="pitch-audio-pane__meta">
          <p className="pitch-audio-pane__meta-freq pitch-readout-display" style={{ color: accent }}>
            {formatFrequencyHz(readout.frequencyHz)}
          </p>
          <p className="pitch-audio-pane__cents pitch-readout-display" style={{ color: accent }}>
            {active ? formatDisplayCents(readout.cents) : '—'}
          </p>
        </div>
      </div>

      <div className="pitch-audio-pane__needle">
        <VerticalPitchMeter cents={displayCents} active={active} />
      </div>

      <div className="pitch-audio-pane__chart-well mt-4 min-h-[140px] flex-1">
        <PitchChartCanvas canvasRef={canvasRef} glass />
      </div>
    </div>
  )
}

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
    <div className="pitch-tuner pitch-tuner--audio flex h-full min-h-0 w-full flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={paneKey}
          className={`flex min-h-0 flex-1 flex-col ${showLive ? 'pitch-tuner__live-body' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
        >
          {showPlayback ? (
            <div className="pitch-glass-panel pitch-glass-panel--audio flex h-full max-h-full min-h-0 w-full flex-col overflow-hidden">
              <AudioTunerPane
                readout={playbackReadout}
                canvasRef={playbackCanvasRef}
                mode="playback"
                takeName={takeName}
              />
            </div>
          ) : showLive ? (
            <LiveAudioTunerPane readout={liveReadout} canvasRef={liveCanvasRef} />
          ) : (
            <div className="pitch-audio-idle-pane flex flex-1 flex-col items-center justify-center px-6 text-center">
              <p className="pitch-audio-idle-pane__title">Pitch Analysis</p>
              <p className="pitch-audio-idle-pane__copy">
                Enable Live Mic Tuner in Settings to practice with a live tuner, or press play to
                analyze this take.
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
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
  const widgetContinuousScroll = isWidget && persistWhenPaused
  const readout = useLivePitchTracker(
    mediaRef,
    enabled && !isAudio,
    isPlaying,
    mediaKey,
    canvasRef,
    canvasTheme,
    {
      source: 'media',
      persistWhenPaused: widgetContinuousScroll,
      continuousScroll: widgetContinuousScroll,
      tunerInstrument,
    },
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
          className="pitch-glass-panel pitch-glass-panel--compact pitch-glass-panel--widget flex w-full flex-col overflow-hidden"
          style={{ height: 188, minHeight: 188 }}
        >
          <div className="pitch-widget-chrome flex shrink-0 items-start justify-between gap-3 px-3.5 pt-3 pb-1 pr-10">
            <p
              className="pitch-readout-display text-base font-bold leading-none tracking-tight"
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
              className="pitch-readout-display shrink-0 text-xs font-semibold"
              style={{ color: accent }}
            >
              {formatFrequencyHz(readout.frequencyHz)}
            </p>
          </div>

          <div className="pitch-widget-chart relative shrink-0 overflow-hidden px-3.5 pb-3">
            <PitchChartCanvas canvasRef={canvasRef} glass />
            {!widgetContinuousScroll && !isPlaying && (
              <p className="pitch-widget-hint pointer-events-none absolute inset-x-3 bottom-2 text-center">
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
          <div className="pitch-widget-chrome flex shrink-0 items-start justify-between gap-4 px-5 pt-5 pb-2">
            <div className="min-w-0">
              <p
                className="pitch-readout-display text-2xl font-bold leading-none tracking-tight"
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
              className="pitch-readout-display shrink-0 text-sm font-bold"
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
