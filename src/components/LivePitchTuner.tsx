import { PremiumMotionDiv, PremiumMotionSection } from './ui/PremiumMotionSurface'
import { premiumMotion } from '../utils/premiumMotion'
import { tunerAdvicePrompt, type TunerInputAdvice } from '../utils/tunerInputAdvice'
import { createTunerTrace, type TunerTrace } from '../utils/tunerTrace'
import TunerHistory from './audioPractice/TunerHistory'
import { appendTunerHistory, type TunerHistorySample } from '../utils/tunerHistory'
import { AnimatePresence } from 'framer-motion'
import { BarChart3, Music2, Settings, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  paintPitchCanvasFrame,
  useLivePitchTracker,
  type AcceptedPitchFrame,
  type PitchSourceHealth,
} from '../hooks/useLivePitchTracker'
import DroneSoundWheel from './audioPractice/DroneSoundWheel'
import PitchInsightsScreen from './audioPractice/PitchInsightsScreen'
import TunerSettingsDialog from './audioPractice/TunerSettingsDialog'
import TuningGauge from './audioPractice/TuningGauge'
import { useTunerWash } from '../hooks/useTunerWash'
import { useLivePitchCoach } from '../hooks/useLivePitchCoach'
import { usePitchInstrumentProfiles } from '../hooks/usePitchInstrumentProfiles'
import { changePitchInstrumentKey } from '../utils/pitchInstrumentProfiles'
import { triggerLightHaptic } from '../utils/haptics'
import {
  formatDisplayCents,
  formatFrequencyHz,
  getIntonationColor,
  getIntonationZone,
  isInTune,
  type PitchReadout,
} from '../utils/pitchUtils'
import type { PitchCanvasTheme, TunerInstrument } from '../utils/pitchConfig'
import {
  DEFAULT_TUNER_TRANSPOSITION,
  concertPitchFromWrittenMidi,
  getTunerTransposition,
  getWrittenPitchLabel,
  transposePitchReadout,
  type TunerTranspositionId,
} from '../utils/tunerTransposition'
import {
  deletePitchObservationsForSessionRange,
  PITCH_INSIGHTS_RESET_EVENT,
  savePitchObservation,
  type PitchInsightsResetDetail,
} from '../db/pitchInsightsRepository'
import { StableNoteTracker } from '../utils/stableNoteTracker'
import {
  loadPitchInsightsCaptureEnabled,
  PitchActivityDetector,
  savePitchInsightsCaptureEnabled,
  type NoisyPitchWindow,
} from '../utils/pitchInsightsCapture'
import { useTutorialAction } from '../context/TutorialContext'
import { safeRandomUUID } from '../utils/uuid'
import { isTunerDiagnosticMode } from '../utils/tunerDiagnosticMode'
import { motionExitHide } from '../utils/motionPresets'
import { showPlus } from '../plus/plusAccess'
import { usePlus } from '../plus/usePlus'
import '../styles/pitch-insights-capture.css'

type NoisyActivityPrompt = NoisyPitchWindow & {
  status: 'suggested' | 'deleting' | 'failed'
  sessionId: string
  transpositionId: string
  instrumentProfileId: string | null
}

interface LivePitchTunerProps {
  nativePitchProcessing?: boolean
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
  /** Display detected concert pitch as the selected instrument's written note. */
  tunerTransposition?: TunerTranspositionId
  /** Audio tuner: opens the written-pitch picker and persists a selection upstream. */
  onTunerTranspositionChange?: (value: TunerTranspositionId) => void
  onTunerInstrumentChange?: (value: TunerInstrument) => void
  hapticsEnabled?: boolean
  /** Widget-only: analyze live mic instead of media element. */
  pitchSource?: 'media' | 'microphone'
  /** Audio mode: analyze live mic stream (recording or idle tuner). */
  liveMicOnly?: boolean
  /** iOS microphone permission was denied, so the idle hint should point to iOS Settings. */
  micPermissionBlocked?: boolean
  /** Reports whether a live microphone source is actually arriving. */
  onLiveSourceHealthChange?: (health: PitchSourceHealth) => void
  /** Audio tuner: show Drone, Transpose, and Pitch Insights controls. */
  audioToolsEnabled?: boolean
  /** Multi-select drone keyboard (audio tuner tab). */
  drone?: {
    activeNotes: number[]
    lastPitchClass?: number | null
    octave: number
    onToggleNote: (pitchClass: number) => void
    onGlissNote: (pitchClass: number, octave: number) => void
    onSetNotes: (pitchClasses: number[]) => void
    onIncrementOctave: () => void
    onDecrementOctave: () => void
    hapticsEnabled?: boolean
  }
}

const DRONE_ANALYSIS_SUPPRESS_MS = 420

function PitchChartCanvas({
  canvasRef,
  glass = false,
  fill = false,
  living = false,
  toolFree = false,
  idleTheme,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  glass?: boolean
  fill?: boolean
  living?: boolean
  toolFree?: boolean
  idleTheme?: PitchCanvasTheme
}) {
  const shellRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!idleTheme) return
    const canvas = canvasRef.current
    const shell = shellRef.current
    if (!canvas || !shell) return

    const paintIdleChrome = () => {
      if (isTunerDiagnosticMode('no-graph')) return
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width <= 0 || height <= 0) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const targetWidth = Math.floor(width * dpr)
      const targetHeight = Math.floor(height * dpr)
      // Live ticks own the bitmap once it matches layout. Only fill a blank or
      // newly-sized canvas so the in-tune band is there on the first frame.
      if (canvas.width === targetWidth && canvas.height === targetHeight) return
      paintPitchCanvasFrame(canvas, idleTheme)
    }

    paintIdleChrome()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const sized =
      canvas.clientWidth > 0 &&
      canvas.width === Math.floor(canvas.clientWidth * dpr) &&
      canvas.height === Math.floor(canvas.clientHeight * dpr)
    const raf = sized ? 0 : requestAnimationFrame(paintIdleChrome)
    const observer = new ResizeObserver(paintIdleChrome)
    observer.observe(shell)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [canvasRef, idleTheme])

  return (
    <div
      ref={shellRef}
      className={`pitch-chart-shell relative w-full flex-1 ${
        living ? 'pitch-chart-shell--living' : ''
      }`}
      style={fill ? { minHeight: '100%', height: '100%' } : { minHeight: 140, height: '100%' }}
    >
      <canvas
        ref={canvasRef}
        className={`pitch-spectrogram absolute inset-0 h-full w-full ${
          glass ? 'pitch-spectrogram--glass' : ''
        } ${living ? 'pitch-spectrogram--living' : ''} ${
          toolFree ? 'pitch-spectrogram--tool-free' : ''
        }`}
        style={fill ? { minHeight: '100%' } : { minHeight: 140 }}
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

export function LiveAudioTunerPane({
  readout,
  canvasRef,
  drone,
  onDroneInteraction,
  tunerInstrument,
  tunerTransposition,
  onTunerTranspositionChange,
  onTunerInstrumentChange,
  hapticsEnabled,
  insightsEnabled = false,
  audioToolsEnabled = true,
  inTuneGlow = 0,
  coachEnabled = false,
  pitchHistory,
  visualTrace,
  insightsCaptureEnabled = true,
  onInsightsCaptureChange,
  noisyActivityPrompt,
  onKeepInsightsOn,
  onTurnOffAndClearRecent,
  transpositionError,
}: {
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  drone?: LivePitchTunerProps['drone']
  onDroneInteraction?: () => void
  tunerInstrument?: TunerInstrument
  tunerTransposition: TunerTranspositionId
  onTunerTranspositionChange?: (value: TunerTranspositionId) => void | boolean
  onTunerInstrumentChange?: (value: TunerInstrument) => void
  hapticsEnabled?: boolean
  insightsEnabled?: boolean
  audioToolsEnabled?: boolean
  inTuneGlow?: number
  coachEnabled?: boolean
  pitchHistory?: RefObject<TunerHistorySample[]>
  visualTrace?: RefObject<TunerTrace>
  insightsCaptureEnabled?: boolean
  onInsightsCaptureChange?: (enabled: boolean) => void
  noisyActivityPrompt?: NoisyActivityPrompt | null
  onKeepInsightsOn?: () => void
  onTurnOffAndClearRecent?: () => void
  transpositionError?: string
}) {
  const notifyTutorial = useTutorialAction()
  const plus = usePlus()
  const stageRef = useRef<HTMLDivElement>(null)
  const [droneOpen, setDroneOpen] = useState(false)
  const [transpositionOpen, setTranspositionOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  useEffect(() => { if (!plus.active) setInsightsOpen(false) }, [plus.active])
  const pitchActive = readout.noteName !== '—'
  const pitchZone = pitchActive ? getIntonationZone(readout.cents) : 'idle'
  const droneActive = Boolean(drone?.activeNotes.length)
  const transposition = getTunerTransposition(tunerTransposition)
  const concertMidi = pitchActive
    ? Math.round(readout.midi) - transposition.writtenOffsetSemitones
    : null
  const coach = useLivePitchCoach({
    enabled: coachEnabled,
    concertMidi,
    writtenNoteName: readout.noteName,
    transpositionId: tunerTransposition,
    suppressed: droneActive,
  })
  const activeDronePitchNames = (drone?.activeNotes ?? []).map((pitchClass) =>
    getWrittenPitchLabel(pitchClass, drone?.octave ?? 4, tunerTransposition).noteName,
  )
  const droneStatus =
    activeDronePitchNames.length === 0
      ? 'Off'
      : activeDronePitchNames.length <= 3
        ? activeDronePitchNames.join(' · ')
        : `${activeDronePitchNames.slice(0, 2).join(' · ')} +${activeDronePitchNames.length - 2}`
  const droneAccessibleStatus = droneActive
    ? `Drone active. Written pitches ${activeDronePitchNames.join(', ')} for ${transposition.label}`
    : `Drone off. Pitches will be shown as written for ${transposition.label}`
  const tunerHapticsEnabled = drone?.hapticsEnabled ?? hapticsEnabled
  const catchConcert =
    drone && pitchActive
      ? concertPitchFromWrittenMidi(readout.midi, tunerTransposition)
      : null
  const catchOctave = catchConcert
    ? Math.min(8, Math.max(0, catchConcert.octave))
    : null
  const holdingCaughtNote = Boolean(
    catchConcert &&
      catchOctave !== null &&
      drone?.activeNotes.length === 1 &&
      drone.activeNotes[0] === catchConcert.pitchClass &&
      drone.octave === catchOctave,
  )

  const usesReactiveSilk =
    typeof document !== 'undefined' &&
    document.documentElement.dataset.refinement === 'depth-electric'

  /**
   * "Visuals off": everything except the pitch rendering keeps running.
   *
   * The detector, the native results, the readout state, history collection
   * and Insights are all untouched — only the canvas, the gauge, the history
   * overlay and the zone class go away. With no canvas mounted, `canvasRef`
   * stays null, so the draw loop paints nothing and the `--silk-live` /
   * `--silk-wash` writes never happen either.
   *
   * This is the one test that halves the search space rather than picking off
   * a suspect: if WebContent still climbs, the cause is JavaScript or state
   * and every rendering hypothesis is out at once; if it goes flat, the cause
   * is entirely in these four things.
   *
   * The tool rail deliberately stays, so a drone can still be started — a held
   * drone is the reproduction (constant pitch, 100% duty cycle, the trace never
   * breaks for silence), and hiding the drone button would make it untestable.
   */
  const visualsOff = isTunerDiagnosticMode('view-off')

  const catchNote = () => {
    if (!drone || !catchConcert || catchOctave === null) return
    onDroneInteraction?.()
    if (holdingCaughtNote) {
      drone.onSetNotes([])
      return
    }
    triggerLightHaptic(tunerHapticsEnabled)
    drone.onGlissNote(catchConcert.pitchClass, catchOctave)
  }

  useTunerWash(
    stageRef,
    pitchActive ? readout.cents : null,
    inTuneGlow,
    !usesReactiveSilk,
  )

  const toggleDrone = () => {
    triggerLightHaptic(tunerHapticsEnabled)
    notifyTutorial?.(droneOpen ? 'tuner-drone-closed' : 'tuner-drone-opened')
    setTranspositionOpen(false)
    setDroneOpen((open) => !open)
  }

  const toggleTransposition = () => {
    triggerLightHaptic(tunerHapticsEnabled)
    setDroneOpen(false)
    setTranspositionOpen((open) => !open)
  }

  const selectTransposition = (value: TunerTranspositionId) => {
    triggerLightHaptic(tunerHapticsEnabled)
    if (onTunerTranspositionChange?.(value) === false) return
    setTranspositionOpen(false)
  }

  const openInsights = () => {
    triggerLightHaptic(tunerHapticsEnabled)
    setDroneOpen(false)
    setTranspositionOpen(false)
    if (!plus.active) {
      showPlus('insights', () => setInsightsOpen(true))
      return
    }
    setInsightsOpen(true)
  }

  return (
    <div
      ref={stageRef}
      className={`pitch-audio-stage pitch-audio-stage--besttake pitch-audio-stage--continuous-wash pitch-audio-stage--${visualsOff ? 'idle' : pitchZone} flex min-h-0 flex-1 flex-col overflow-hidden`}
    >
      <div className="pitch-living-canvas">
        {visualsOff ? null : (
          <>
            <PitchChartCanvas
              canvasRef={canvasRef}
              fill
              living
              toolFree={!audioToolsEnabled}
              idleTheme="living-audio"
            />
            <TuningGauge
              readout={readout}
              coach={coach}
              onCatchNote={drone ? catchNote : undefined}
              catchPressed={holdingCaughtNote}
              catchLabel={
                holdingCaughtNote
                  ? `Release ${readout.noteName} drone`
                  : `Hold ${readout.noteName} as a drone`
              }
            />

            {pitchHistory && visualTrace && <TunerHistory key={`${tunerInstrument}-${tunerTransposition}`} samples={pitchHistory} trace={visualTrace} transposition={tunerTransposition} />}
            <div className="pitch-living-canvas__direction" aria-hidden>
              <span>Sharp</span>
              <span>In tune</span>
              <span>Flat</span>
            </div>
          </>
        )}

        {audioToolsEnabled && (drone || onTunerTranspositionChange || insightsEnabled) ? (
          <>
            <div
              className={`pitch-living-tool-rail ${drone ? 'pitch-living-tool-rail--with-drone' : ''}`}
              role="toolbar"
              aria-label="Tuner tools"
            >
              {drone ? (
                <button
                  type="button"
                  data-tutorial="tuner-drone-button"
                  className={`pitch-living-drone-trigger ${
                    droneActive ? 'pitch-living-drone-trigger--active' : ''
                  }`}
                  onClick={toggleDrone}
                  aria-expanded={droneOpen}
                  aria-controls="pitch-living-drone-panel"
                  aria-label={`${droneOpen ? 'Hide' : 'Open'} drone. ${droneAccessibleStatus}`}
                  title={droneOpen ? 'Hide drone' : `Open drone · ${droneStatus}`}
                >
                  <Music2 aria-hidden />
                  <span>Drone</span>
                  <small>{droneStatus}</small>
                </button>
              ) : null}

              {insightsEnabled ? (
                <button
                  type="button"
                  className="pitch-living-drone-trigger pitch-living-insights-trigger"
                  onClick={openInsights}
                  aria-haspopup="dialog"
                  aria-label={`Open Pitch Insights${insightsCaptureEnabled ? '' : ', saving off'}`}
                  title={insightsCaptureEnabled ? 'Pitch Insights' : 'Pitch Insights · saving off'}
                >
                  <BarChart3 aria-hidden />
                  <span>Insights</span>
                  {!insightsCaptureEnabled ? <small>Off</small> : null}
                </button>
              ) : null}

              {onTunerTranspositionChange ? (
                <button
                  type="button"
                  className={`pitch-living-drone-trigger pitch-living-transposition-trigger ${
                    tunerTransposition !== DEFAULT_TUNER_TRANSPOSITION
                      ? 'pitch-living-transposition-trigger--active'
                      : ''
                  }`}
                  data-guidance="tuner-settings"
                  onClick={toggleTransposition}
                  aria-expanded={transpositionOpen}
                  aria-controls="pitch-living-transposition-panel"
                  aria-label={`Open tuner settings. ${tunerTransposition === 'concert' ? 'Concert pitch' : `Written ${transposition.shortLabel}`}`}
                  title={transpositionOpen ? 'Hide tuner settings' : `Tuner settings · ${transposition.shortLabel}`}
                >
                  <Settings className="electric-tuning-old" aria-hidden /><SlidersHorizontal className="electric-tuning-new" aria-hidden />
                  <span className="electric-tuning-old">Settings</span><span className="electric-tuning-new">Tuning</span>
                  <small>{transposition.shortLabel}</small>
                </button>
              ) : null}
            </div>

            {/*
              * Insights is already paused by the time this shows, so nothing
              * here is urgent: one line of why, two answers, out of the way of
              * the readout. "Turn off" also drops the noisy stretch just heard.
              */}
            <AnimatePresence>
              {insightsEnabled && noisyActivityPrompt ? (
                <PremiumMotionSection
                  key="insights-activity-prompt"
                  className="pitch-insights-activity-prompt"
                  role="status"
                  aria-label="Pitch Insights paused"
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 10, opacity: 0, transitionEnd: motionExitHide }}
                  transition={premiumMotion({ type: 'spring', stiffness: 420, damping: 36 }, 'popover')}
                >
                  <div className="pitch-insights-activity-prompt__copy">
                    <strong>{noisyActivityPrompt.status === 'failed' ? 'Couldn’t clear those readings' : 'Playing with others?'}</strong>
                    <p>{noisyActivityPrompt.status === 'failed'
                      ? 'Insights is off. Try again to remove them.'
                      : 'Insights is paused. Turning off clears recent readings.'}</p>
                  </div>
                  <div className="pitch-insights-activity-prompt__actions">
                    <button type="button" disabled={noisyActivityPrompt.status === 'deleting'} onClick={onKeepInsightsOn}>
                      {noisyActivityPrompt.status === 'failed' ? 'Dismiss' : 'Keep on'}
                    </button>
                    <button type="button" className="pitch-insights-activity-prompt__primary"
                      disabled={noisyActivityPrompt.status === 'deleting'} onClick={onTurnOffAndClearRecent}>
                      {noisyActivityPrompt.status === 'deleting' ? 'Turning off…'
                        : noisyActivityPrompt.status === 'failed' ? 'Try again'
                          : 'Turn off'}
                    </button>
                  </div>
                </PremiumMotionSection>
              ) : null}
            </AnimatePresence>

            {/*
              * Both panels share this AnimatePresence, so both need a key.
              *
              * Without one, framer-motion identifies a child by its position
              * and sees a single slot: swapping the drone panel for the
              * transposition panel reads as "the same child re-rendered",
              * not as one leaving and another arriving, so the outgoing
              * panel's exit is skipped and the incoming one's enter starts
              * from whatever state the last frame left behind.
              */}
            <AnimatePresence mode="wait">
              {droneOpen && drone ? (
                <PremiumMotionSection
                  key="drone-panel"
                  id="pitch-living-drone-panel"
                  className="pitch-living-drone-panel"
                  initial={{ y: '105%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '105%', opacity: 0, transitionEnd: motionExitHide }}
                  transition={premiumMotion({type:"spring",stiffness:390,damping:36}, 'panel')}
                  aria-label="Drone widget"
                >
                  <DroneSoundWheel
                    activeNotes={drone.activeNotes}
                    lastPitchClass={drone.lastPitchClass}
                    octave={drone.octave}
                    onToggleNote={drone.onToggleNote}
                    onGlissNote={drone.onGlissNote}
                    onSetNotes={drone.onSetNotes}
                    onIncrementOctave={drone.onIncrementOctave}
                    onDecrementOctave={drone.onDecrementOctave}
                    onDroneInteraction={onDroneInteraction}
                    onClose={toggleDrone}
                    hapticsEnabled={drone.hapticsEnabled}
                    tunerTransposition={tunerTransposition}
                  />
                </PremiumMotionSection>
              ) : null}

              {transpositionOpen && onTunerTranspositionChange ? (
                <TunerSettingsDialog
                  key="transposition-panel"
                    value={tunerTransposition}
                    onChange={selectTransposition}
                    onClose={toggleTransposition}
                    instrument={tunerInstrument}
                    onInstrumentChange={onTunerInstrumentChange}
                    error={transpositionError}
                />
              ) : null}
            </AnimatePresence>
          </>
        ) : null}
      </div>

      {audioToolsEnabled && insightsEnabled && plus.active ? (
        <PitchInsightsScreen
          isOpen={insightsOpen}
          onClose={() => {
            setInsightsOpen(false)
          }}
          transpositionId={tunerTransposition}
          onLegacyTranspositionChange={onTunerTranspositionChange}
          tunerInstrument={tunerInstrument}
          hapticFeedback={tunerHapticsEnabled}
          captureEnabled={insightsCaptureEnabled}
          onCaptureEnabledChange={onInsightsCaptureChange}
        />
      ) : null}
    </div>
  )
}

/**
 * The Tuner tab's stage, sized for the floating widget: the same living trace,
 * the same gauge, and the same tint easing along the line color. Only the tool
 * rail is left behind — the drone and transposition live in the tab.
 */
export function LivingPitchWidgetPane({
  readout,
  canvasRef,
  inTuneGlow = 0,
  coachEnabled = false,
  tunerTransposition,
}: {
  readout: PitchReadout
  canvasRef: RefObject<HTMLCanvasElement | null>
  inTuneGlow?: number
  coachEnabled?: boolean
  tunerTransposition: TunerTranspositionId
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const active = readout.noteName !== '—'
  const zone = active ? getIntonationZone(readout.cents) : 'idle'
  const concertMidi = active
    ? Math.round(readout.midi) - getTunerTransposition(tunerTransposition).writtenOffsetSemitones
    : null
  const coach = useLivePitchCoach({
    enabled: coachEnabled,
    concertMidi,
    writtenNoteName: readout.noteName,
    transpositionId: tunerTransposition,
    suppressed: false,
  })

  useTunerWash(stageRef, active ? readout.cents : null, inTuneGlow, true)

  return (
    <div
      ref={stageRef}
      className={`pitch-widget-living pitch-audio-stage--${zone}`}
    >
      <div className="pitch-living-canvas pitch-widget-living__canvas">
        <PitchChartCanvas canvasRef={canvasRef} glass fill living />
        <TuningGauge readout={readout} coach={coach} />

        <div className="pitch-living-canvas__direction" aria-hidden>
          <span>Sharp</span>
          <span>In tune</span>
          <span>Flat</span>
        </div>
      </div>
    </div>
  )
}

function LivePitchTunerAudio({
  mediaRef,
  isPlaying,
  mediaKey,
  takeName: _takeName,
  enabled,
  liveMicEnabled,
  micStreamRef,
  tunerInstrument = 'voice',
  tunerTransposition: suppliedTransposition = DEFAULT_TUNER_TRANSPOSITION,
  onTunerTranspositionChange: persistTransposition,
  onTunerInstrumentChange,
  hapticsEnabled,
  liveMicOnly = false,
  micPermissionBlocked = false,
  drone,
  onLiveSourceHealthChange,
  audioToolsEnabled = true,
  nativePitchProcessing = false,
}: {
  mediaRef: RefObject<HTMLMediaElement | null>
  isPlaying: boolean
  mediaKey: string
  takeName?: string
  enabled: boolean
  liveMicEnabled: boolean
  micStreamRef?: RefObject<MediaStream | null>
  tunerInstrument?: TunerInstrument
  tunerTransposition?: TunerTranspositionId
  onTunerTranspositionChange?: (value: TunerTranspositionId) => void
  onTunerInstrumentChange?: (value: TunerInstrument) => void
  hapticsEnabled?: boolean
  liveMicOnly?: boolean
  micPermissionBlocked?: boolean
  drone?: LivePitchTunerProps['drone']
  onLiveSourceHealthChange?: (health: PitchSourceHealth) => void
  audioToolsEnabled?: boolean
  nativePitchProcessing?: boolean
}) {
  const { activeProfile } = usePitchInstrumentProfiles()
  const tunerTransposition = activeProfile?.transpositionId ?? suppliedTransposition
  const [transpositionError, setTranspositionError] = useState('')
  const onTunerTranspositionChange = useCallback((value: TunerTranspositionId) => {
    try {
      changePitchInstrumentKey(value, persistTransposition, suppliedTransposition)
      setTranspositionError('')
      return true
    } catch {
      setTranspositionError('Could not change the instrument key on this device. Your previous selection remains. Please try again.')
      return false
    }
  }, [persistTransposition, suppliedTransposition])
  const [inputAdvice, setInputAdvice] = useState<TunerInputAdvice>(null)
  const [dismissedAdvice, setDismissedAdvice] = useState<TunerInputAdvice[]>([])
  const advicePrompt = tunerAdvicePrompt(inputAdvice, tunerInstrument)
  useEffect(() => { setInputAdvice(null) }, [tunerInstrument, enabled])
  const pitchHistoryRef = useRef<TunerHistorySample[]>([])
  const visualTraceRef = useRef<TunerTrace>(createTunerTrace())
  useEffect(() => { pitchHistoryRef.current = []; visualTraceRef.current = createTunerTrace() }, [tunerInstrument, tunerTransposition, activeProfile?.id])
  const liveCanvasRef = useRef<HTMLCanvasElement>(null)
  const playbackCanvasRef = useRef<HTMLCanvasElement>(null)
  const droneAnalysisSuppressUntilRef = useRef(0)
  const insightsSessionIdRef = useRef<string | null>(null)
  if (!insightsSessionIdRef.current) {
    insightsSessionIdRef.current = safeRandomUUID()
  }
  const insightsContextRef = useRef({
    tunerInstrument,
    transpositionId: tunerTransposition,
    sessionId: insightsSessionIdRef.current,
    instrumentProfileId: activeProfile?.id ?? null,
    instrumentProfileName: activeProfile?.name ?? null,
  })
  insightsContextRef.current = {
    ...insightsContextRef.current,
    tunerInstrument,
    transpositionId: tunerTransposition,
    instrumentProfileId: activeProfile?.id ?? null,
    instrumentProfileName: activeProfile?.name ?? null,
  }
  const [insightsCaptureEnabled, setInsightsCaptureEnabled] = useState(loadPitchInsightsCaptureEnabled)
  const insightsCaptureEnabledRef = useRef(insightsCaptureEnabled)
  insightsCaptureEnabledRef.current = insightsCaptureEnabled
  const [noisyActivityPrompt, setNoisyActivityPrompt] = useState<NoisyActivityPrompt | null>(null)
  const insightsPausedForPromptRef = useRef(false)
  const activityDetectorRef = useRef(new PitchActivityDetector())
  const stableNoteTrackerRef = useRef<StableNoteTracker | null>(null)
  if (!stableNoteTrackerRef.current) {
    stableNoteTrackerRef.current = new StableNoteTracker((observation) => {
      if (nativePitchProcessing && isTunerDiagnosticMode('no-insights')) return
      if (!insightsCaptureEnabledRef.current || insightsPausedForPromptRef.current) return
      void savePitchObservation(observation).catch((error: unknown) => {
        console.warn('[PitchInsights] Failed to save stable observation', error)
      })
    })
  }
  useLayoutEffect(() => {
    stableNoteTrackerRef.current?.finish()
    activityDetectorRef.current.reset()
  }, [activeProfile?.id, tunerTransposition])
  useLayoutEffect(() => {
    const handleReset = (event: Event) => {
      const detail = (event as CustomEvent<PitchInsightsResetDetail>).detail
      if (detail) stableNoteTrackerRef.current?.reset(detail)
    }
    window.addEventListener(PITCH_INSIGHTS_RESET_EVENT, handleReset)
    return () => window.removeEventListener(PITCH_INSIGHTS_RESET_EVENT, handleReset)
  }, [])
  // A sustained in-app drone is valid tuner context, but it is not reliable
  // evidence of the musician's own pitch. With music capture processing the
  // speaker can bleed into the microphone, so keep the live readout running
  // while excluding those frames from long-term Insights.
  const insightsSuppressedRef = useRef(Boolean(drone?.activeNotes.length))
  const insightsSuppressed = Boolean(drone?.activeNotes.length)
  insightsSuppressedRef.current = insightsSuppressed

  const handleAcceptedPitchFrame = useCallback((frame: AcceptedPitchFrame | null) => {
    appendTunerHistory(pitchHistoryRef.current, frame?.timestamp ?? Date.now(), frame?.readout ?? null)
    if (nativePitchProcessing && isTunerDiagnosticMode('no-insights')) return
    const tracker = stableNoteTrackerRef.current
    if (!tracker) return
    if (!insightsCaptureEnabledRef.current || insightsPausedForPromptRef.current) {
      tracker.discard()
      return
    }
    if (!frame || insightsSuppressedRef.current) {
      // Silence also releases a reset-discarded held note, so a fresh attempt
      // at the same pitch can be collected normally.
      tracker.ingest(null, insightsContextRef.current)
      activityDetectorRef.current.observe(null, frame?.timestamp ?? Date.now())
      return
    }
    const noisyWindow = activityDetectorRef.current.observe(frame.readout.midi, frame.timestamp)
    if (noisyWindow) {
      insightsPausedForPromptRef.current = true
      tracker.discard()
      setNoisyActivityPrompt({
        ...noisyWindow, status: 'suggested', sessionId: insightsSessionIdRef.current!,
        transpositionId: insightsContextRef.current.transpositionId,
        instrumentProfileId: insightsContextRef.current.instrumentProfileId ?? null,
      })
      return
    }
    tracker.ingest(
      {
        midiNote: frame.readout.midi,
        noteName: frame.readout.noteName,
        centsOffset: frame.readout.cents,
        frequencyHz: frame.readout.frequencyHz,
        confidence: frame.confidence,
        timestamp: frame.timestamp,
      },
      insightsContextRef.current,
    )
  }, [nativePitchProcessing])

  useEffect(() => {
    return () => {
      if (insightsCaptureEnabledRef.current && !insightsPausedForPromptRef.current) {
        stableNoteTrackerRef.current?.finish()
      } else {
        stableNoteTrackerRef.current?.discard()
      }
    }
  }, [])

  useEffect(() => {
    if (insightsSuppressed) {
      if (insightsCaptureEnabled && !insightsPausedForPromptRef.current) stableNoteTrackerRef.current?.finish()
      else stableNoteTrackerRef.current?.discard()
      activityDetectorRef.current.reset()
    }
  }, [insightsCaptureEnabled, insightsSuppressed])

  const suppressDroneAnalysis = useCallback(() => {
    droneAnalysisSuppressUntilRef.current = performance.now() + DRONE_ANALYSIS_SUPPRESS_MS
  }, [])

  const showPlayback = isPlaying && !liveMicOnly
  const showLive = liveMicOnly ? enabled : isPlaying || liveMicEnabled || enabled
  const liveTrackerEnabled = enabled && showLive && liveMicEnabled
  const playbackTrackerEnabled = enabled && showPlayback

  const changeInsightsCapture = useCallback((next: boolean) => {
    stableNoteTrackerRef.current?.discard()
    insightsCaptureEnabledRef.current = next
    setInsightsCaptureEnabled(next)
    savePitchInsightsCaptureEnabled(next)
    insightsPausedForPromptRef.current = false
    activityDetectorRef.current.reset(true)
    setNoisyActivityPrompt(null)
  }, [])

  const keepInsightsOn = useCallback(() => {
    insightsPausedForPromptRef.current = false
    activityDetectorRef.current.reset()
    setNoisyActivityPrompt(null)
  }, [])

  const turnOffAndClearRecent = useCallback(() => {
    if (!noisyActivityPrompt || noisyActivityPrompt.status === 'deleting') return
    insightsCaptureEnabledRef.current = false
    setInsightsCaptureEnabled(false)
    savePitchInsightsCaptureEnabled(false)
    stableNoteTrackerRef.current?.discard()
    setNoisyActivityPrompt({ ...noisyActivityPrompt, status: 'deleting' })
    void deletePitchObservationsForSessionRange(
      noisyActivityPrompt.sessionId, noisyActivityPrompt.startAt, noisyActivityPrompt.endAt,
      { transpositionId: noisyActivityPrompt.transpositionId, instrumentProfileId: noisyActivityPrompt.instrumentProfileId },
    ).then(() => {
      insightsPausedForPromptRef.current = false
      activityDetectorRef.current.reset()
      setNoisyActivityPrompt(null)
    }).catch((error: unknown) => {
      console.warn('[PitchInsights] Failed to remove noisy-session readings', error)
      setNoisyActivityPrompt({ ...noisyActivityPrompt, status: 'failed' })
    })
  }, [noisyActivityPrompt])

  const liveTrackerOptions = useMemo(
    () => ({
      source: 'microphone' as const,
      visualTrace: liveMicOnly ? visualTraceRef : undefined,
      nativePitchProcessing: liveMicOnly && nativePitchProcessing,
      micStreamRef,
      continuousScroll: true,
      persistWhenPaused: true,
      tunerInstrument,
      realtimeMode: true,
      suppressUntilRef: droneAnalysisSuppressUntilRef,
      allowStandaloneMicFallback: liveMicOnly,
      preferNativeAudioTap: true,
      retryNativeTapOnInteractiveRecovery: liveMicOnly,
      onSourceHealthChange: onLiveSourceHealthChange,
      // The inline prompt below handles detection trouble; no separate tip.
      onInputAdvice: (advice: TunerInputAdvice) => setInputAdvice(advice),
      onAcceptedPitchFrame: liveMicOnly ? handleAcceptedPitchFrame : undefined,
    }),
    [
      handleAcceptedPitchFrame,
      nativePitchProcessing,
      liveMicOnly,
      micStreamRef,
      onLiveSourceHealthChange,
      tunerInstrument,
    ],
  )

  const playbackTrackerOptions = useMemo(
    () => ({
      source: 'media' as const,
      persistWhenPaused: true,
      tunerInstrument,
      realtimeMode: true,
    }),
    [tunerInstrument],
  )

  const liveTracker = useLivePitchTracker(
    mediaRef,
    liveTrackerEnabled,
    liveTrackerEnabled,
    `live-mic-${mediaKey}`,
    liveCanvasRef,
    'living-audio',
    liveTrackerOptions,
  )

  const playbackTracker = useLivePitchTracker(
    mediaRef,
    playbackTrackerEnabled,
    playbackTrackerEnabled,
    `${mediaKey}-playback`,
    playbackCanvasRef,
    'living-audio',
    playbackTrackerOptions,
  )

  const liveReadout = useMemo(
    () => transposePitchReadout(liveTracker.readout, tunerTransposition),
    [liveTracker.readout, tunerTransposition],
  )
  const playbackReadout = useMemo(
    () => transposePitchReadout(playbackTracker.readout, tunerTransposition),
    [playbackTracker.readout, tunerTransposition],
  )

  const paneKey = showPlayback ? 'playback' : showLive ? 'live' : 'idle'

  return (
    <div className="pitch-tuner pitch-tuner--audio flex h-full min-h-0 w-full flex-col">
      {enabled && advicePrompt && !dismissedAdvice.includes(inputAdvice) && (
        <div className="tuner-input-advice" role="status">
          <span>{advicePrompt.message}</span>
          {advicePrompt.switchTo && onTunerInstrumentChange && (
            <button type="button" onClick={() => { onTunerInstrumentChange(advicePrompt.switchTo!); setInputAdvice(null) }}>
              Use {advicePrompt.switchTo === 'voice' ? 'Voice' : advicePrompt.switchTo === 'winds' ? 'Winds' : 'Strings'}
            </button>
          )}
          <button type="button" aria-label="Dismiss tuner tip" onClick={() => setDismissedAdvice(list => [...list, inputAdvice])}>✕</button>
        </div>
      )}
      <AnimatePresence mode="wait" initial={false}>
        <PremiumMotionDiv
          key={paneKey}
          className={`flex min-h-0 flex-1 flex-col ${showLive || showPlayback ? 'pitch-tuner__live-body' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
        >
          {showPlayback ? (
            <LiveAudioTunerPane
              readout={playbackReadout}
              canvasRef={playbackCanvasRef}
              drone={drone}
              onDroneInteraction={suppressDroneAnalysis}
              tunerInstrument={tunerInstrument}
              tunerTransposition={tunerTransposition}
              onTunerTranspositionChange={onTunerTranspositionChange}
              transpositionError={transpositionError}
              onTunerInstrumentChange={onTunerInstrumentChange}
              hapticsEnabled={hapticsEnabled}
              insightsEnabled={audioToolsEnabled && liveMicOnly}
              audioToolsEnabled={audioToolsEnabled}
              inTuneGlow={playbackTracker.inTuneGlow}
              insightsCaptureEnabled={insightsCaptureEnabled}
              onInsightsCaptureChange={changeInsightsCapture}
              noisyActivityPrompt={noisyActivityPrompt}
              onKeepInsightsOn={keepInsightsOn}
              onTurnOffAndClearRecent={turnOffAndClearRecent}
            />
          ) : showLive ? (
            <LiveAudioTunerPane
              readout={liveReadout}
              canvasRef={liveCanvasRef}
              drone={drone}
              onDroneInteraction={suppressDroneAnalysis}
              tunerInstrument={tunerInstrument}
              tunerTransposition={tunerTransposition}
              onTunerTranspositionChange={onTunerTranspositionChange}
              transpositionError={transpositionError}
              onTunerInstrumentChange={onTunerInstrumentChange}
              hapticsEnabled={hapticsEnabled}
              insightsEnabled={audioToolsEnabled && liveMicOnly}
              audioToolsEnabled={audioToolsEnabled}
              inTuneGlow={liveTracker.inTuneGlow}
              coachEnabled={liveMicOnly && !(nativePitchProcessing && isTunerDiagnosticMode('no-insights'))}
              pitchHistory={liveMicOnly ? pitchHistoryRef : undefined}
              visualTrace={liveMicOnly ? visualTraceRef : undefined}
              insightsCaptureEnabled={insightsCaptureEnabled}
              onInsightsCaptureChange={changeInsightsCapture}
              noisyActivityPrompt={noisyActivityPrompt}
              onKeepInsightsOn={keepInsightsOn}
              onTurnOffAndClearRecent={turnOffAndClearRecent}
            />
          ) : (
            <div className="pitch-audio-idle-pane pitch-audio-idle-pane--polished flex flex-1 flex-col items-center justify-center px-6 text-center">
              <p className="pitch-audio-idle-pane__title">Pitch Analysis</p>
              <p className="pitch-audio-idle-pane__copy">
                {micPermissionBlocked
                  ? 'Microphone access is off. Turn it on in iOS Settings to use the live tuner, or press play to analyze this take.'
                  : 'Enable Live Mic Tuner in Settings to practice with a live tuner, or press play to analyze this take.'}
              </p>
            </div>
          )}
        </PremiumMotionDiv>
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
  tunerTransposition: suppliedTransposition = DEFAULT_TUNER_TRANSPOSITION,
  onTunerTranspositionChange,
  onTunerInstrumentChange,
  hapticsEnabled,
  pitchSource = 'media',
  liveMicOnly = false,
  micPermissionBlocked = false,
  drone,
  onLiveSourceHealthChange,
  audioToolsEnabled = true,
  nativePitchProcessing = false,
}: LivePitchTunerProps) {
  const { activeProfile } = usePitchInstrumentProfiles()
  const tunerTransposition = activeProfile?.transpositionId ?? suppliedTransposition
  const isPanel = variant === 'panel'
  const isWidget = variant === 'widget'
  const isAudio = variant === 'audio'
  const isStage = variant === 'stage'
  const canvasTheme = isWidget ? 'glass-audio' : isPanel ? 'glass-legacy' : 'solid'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widgetContinuousScroll = isWidget && persistWhenPaused
  const liveMicWidget = isWidget && pitchSource === 'microphone'
  const trackerActive = enabled && !isAudio && (!liveMicWidget || liveMicEnabled)
  const trackerPlaying = liveMicWidget ? trackerActive : isPlaying
  const tracker = useLivePitchTracker(
    mediaRef,
    trackerActive,
    trackerPlaying,
    mediaKey,
    canvasRef,
    canvasTheme,
    {
      source: liveMicWidget ? 'microphone' : 'media',
      micStreamRef: liveMicWidget ? micStreamRef : undefined,
      persistWhenPaused: widgetContinuousScroll,
      continuousScroll: liveMicWidget || widgetContinuousScroll,
      tunerInstrument,
      realtimeMode: isWidget,
      preferNativeAudioTap: liveMicWidget,
      nativePitchProcessing: liveMicWidget && nativePitchProcessing,
      allowStandaloneMicFallback: liveMicWidget,
      retryNativeTapOnInteractiveRecovery: liveMicWidget,
      onSourceHealthChange: liveMicWidget ? onLiveSourceHealthChange : undefined,
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
        tunerTransposition={tunerTransposition}
        onTunerTranspositionChange={onTunerTranspositionChange}
        onTunerInstrumentChange={onTunerInstrumentChange}
        hapticsEnabled={hapticsEnabled}
        liveMicOnly={liveMicOnly}
        micPermissionBlocked={micPermissionBlocked}
        drone={drone}
        onLiveSourceHealthChange={onLiveSourceHealthChange}
        audioToolsEnabled={audioToolsEnabled}
        nativePitchProcessing={nativePitchProcessing}
      />
    )
  }

  const displayReadout = transposePitchReadout(tracker.readout, tunerTransposition)

  const active = displayReadout.noteName !== '—'
  const displayCents = active ? displayReadout.cents : 0
  const accent = active ? getIntonationColor(displayCents) : 'rgba(255,255,255,0.55)'
  const inTune = active && isInTune(displayReadout.cents)
  const zone = active ? getIntonationZone(displayReadout.cents) : null
  const spectrogramHeight = isStage
    ? 'min-h-0 flex-1'
    : 'h-[6.5rem]'

  if (isWidget) {
    return (
      <div className="pitch-tuner pitch-tuner--widget flex h-full min-h-0 w-full flex-col">
        <div className="pitch-glass-panel pitch-glass-panel--compact pitch-glass-panel--widget pitch-glass-panel--elevated relative flex h-full min-h-0 w-full flex-col overflow-hidden">
          <LivingPitchWidgetPane
            readout={displayReadout}
            canvasRef={canvasRef}
            inTuneGlow={tracker.inTuneGlow}
            coachEnabled={liveMicWidget}
            tunerTransposition={tunerTransposition}
          />
          {!widgetContinuousScroll && !isPlaying && !liveMicWidget && (
            <p className="pitch-widget-hint pointer-events-none shrink-0 px-3 pb-2 text-center">
              Pitch trace during playback
            </p>
          )}
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
                {displayReadout.noteName}
                {active && (
                  <span className="ml-2 text-lg font-semibold">
                    {formatDisplayCents(displayReadout.cents)}
                  </span>
                )}
              </p>
            </div>
            <p
              className="pitch-readout-display shrink-0 text-sm font-bold"
              style={{ color: accent }}
            >
              {formatFrequencyHz(displayReadout.frequencyHz)}
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
      <div className="pitch-tuner flex h-full w-full flex-col overflow-hidden bg-black">
        <div className="shrink-0 border-b border-white/8 px-5 py-4">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/35">
                {label}
              </p>
              {takeName && (
                <p className="mt-0.5 truncate text-sm text-white/50">{takeName}</p>
              )}
              <p
                className="mt-2 font-mono text-6xl font-bold leading-none tabular-nums sm:text-7xl"
                style={{ color: accent }}
              >
                {displayReadout.noteName}
              </p>
              <p className="mt-1.5 font-mono text-xs text-white/35">
                {formatFrequencyHz(displayReadout.frequencyHz)}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p
                className="font-mono text-3xl font-semibold tabular-nums"
                style={{ color: accent }}
              >
                {active ? formatDisplayCents(displayReadout.cents) : '—'}
              </p>
              <div className="mt-1.5">
                <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <CentsNeedle cents={displayReadout.cents} active={active} />
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
    <div className="pitch-tuner flex h-full w-full flex-col overflow-hidden bg-black/95">
      <div className="shrink-0 border-b border-white/8 px-4 py-3">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-white/35">
              {label}
            </p>
            {takeName && (
              <p className="mt-0.5 truncate text-xs text-white/45">{takeName}</p>
            )}
            <p
              className="mt-1 font-mono text-5xl font-bold leading-none tabular-nums"
              style={{ color: accent }}
            >
              {displayReadout.noteName}
            </p>
            <p className="mt-1 font-mono text-[11px] text-white/35">
              {formatFrequencyHz(displayReadout.frequencyHz)}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p
              className="font-mono text-2xl font-semibold tabular-nums"
              style={{ color: accent }}
            >
              {active ? formatDisplayCents(displayReadout.cents) : '—'}
            </p>
            <div className="mt-1">
              <StatusLabel active={active} inTune={inTune} zone={zone} isPlaying={isPlaying} />
            </div>
          </div>
        </div>

        <div className="mt-3">
          <CentsNeedle cents={displayReadout.cents} active={active} />
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
