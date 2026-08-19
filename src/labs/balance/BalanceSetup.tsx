import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  ArrowLeft,
  ChevronDown,
  Mic,
  Play,
} from 'lucide-react'
import type { PitchSourceHealth } from '../../hooks/useLivePitchTracker'
import type { PitchReadout } from '../../utils/pitchUtils'
import Pressable from '../../components/ui/Pressable'
import { writtenMidiToConcertMidi } from '../../utils/tunerTransposition'
import {
  BALANCE_DIRECTION_LABELS,
  BALANCE_INSTRUMENTS,
  BALANCE_SCALE_TYPE_LABELS,
  clampWrittenMidi,
  getBalanceInstrument,
  midiToBalanceNoteName,
  routineSummary,
} from './balanceMusic'
import { formatBalanceDuration, toleranceCentsForSettings } from './balanceStorage'
import { startBalanceTone, type DroneHandle } from './balanceAudio'
import BalanceScene from './BalanceScene'
import { centsFromConcertTarget, movementSpeedForCents } from './balanceScoring'
import type {
  BalanceCustomRoutine,
  BalanceScaleDirection,
  BalanceScaleType,
  BalanceSettings,
  BalanceTarget,
} from './balanceTypes'
import BalanceRoutineEditor from './BalanceRoutineEditor'
import {
  BALANCE_GOAL_OPTIONS,
  balanceDestinationGeometry,
  balanceGoalIndex,
} from './balanceGoal'

type SetupSection = 'routine' | 'instrument'

interface BalanceSetupProps {
  settings: BalanceSettings
  customRoutines: BalanceCustomRoutine[]
  previewTarget: BalanceTarget | null
  bestBalancedMs: number
  readout: PitchReadout
  sourceHealth: PitchSourceHealth
  permissionBlocked: boolean
  permissionPending: boolean
  hapticFeedback: boolean
  suppressUntilRef: MutableRefObject<number>
  onBack: () => void
  onStart: () => void
  onRequestMic: () => void
  onUpdate: (patch: Partial<BalanceSettings>) => void
  onSaveCustom: (routine: BalanceCustomRoutine) => void
  onDeleteCustom: (id: string) => void
}

function SetupGroup({
  id,
  open,
  title,
  summary,
  hapticFeedback,
  onToggle,
  children,
}: {
  id: SetupSection
  open: boolean
  title: string
  summary: string
  hapticFeedback: boolean
  onToggle: (id: SetupSection) => void
  children: ReactNode
}) {
  return (
    <section className={`balance-setup-group ${open ? 'is-open' : ''}`}>
      <Pressable
        intensity="soft"
        hapticFeedback={hapticFeedback}
        className="balance-setup-group__head"
        onClick={() => onToggle(id)}
        aria-expanded={open}
      >
        <span><strong>{title}</strong><small>{summary}</small></span>
        <ChevronDown aria-hidden />
      </Pressable>
      {open && <div className="balance-setup-group__body">{children}</div>}
    </section>
  )
}

function pointerRatio(
  event: ReactPointerEvent<HTMLElement>,
  orientation: 'horizontal' | 'vertical',
): number {
  const rect = event.currentTarget.getBoundingClientRect()
  if (orientation === 'vertical') {
    return Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / Math.max(1, rect.height)))
  }
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)))
}

export default function BalanceSetup({
  settings,
  customRoutines,
  previewTarget,
  bestBalancedMs,
  readout,
  sourceHealth,
  permissionBlocked,
  permissionPending,
  hapticFeedback,
  suppressUntilRef,
  onBack,
  onStart,
  onRequestMic,
  onUpdate,
  onSaveCustom,
  onDeleteCustom,
}: BalanceSetupProps) {
  const [openSection, setOpenSection] = useState<SetupSection | null>(null)
  const [distanceDragging, setDistanceDragging] = useState(false)
  const previewSceneRef = useRef<HTMLDivElement | null>(null)
  const distancePointerIdRef = useRef<number | null>(null)
  const instrument = getBalanceInstrument(settings.instrumentId)
  const hasPitch = readout.noteName !== '—' && readout.frequencyHz > 0
  const selectedCustom = customRoutines.find((routine) => routine.id === settings.selectedCustomRoutineId)
  const tolerance = toleranceCentsForSettings(settings)
  const scaleSpan = settings.scale.octaveRange * 12
  const maxScaleRoot = Math.max(instrument.minWrittenMidi, instrument.maxWrittenMidi - scaleSpan)
  const micLabel = permissionBlocked
    ? 'Microphone permission is off'
    : permissionPending || sourceHealth === 'connecting'
      ? 'Connecting microphone…'
      : hasPitch
        ? `Hearing ${readout.noteName}`
        : sourceHealth === 'stalled'
          ? 'Microphone unavailable'
          : 'Play a note to check your mic'

  const targetMidi =
    settings.routineType === 'scale' ? settings.scale.rootWrittenMidi : settings.single.writtenMidi
  const targetMin = instrument.minWrittenMidi
  const targetMax = settings.routineType === 'scale' ? maxScaleRoot : instrument.maxWrittenMidi
  const targetCanChange = settings.routineType !== 'custom' && targetMax > targetMin

  const pitchToneRef = useRef<DroneHandle | null>(null)
  const pitchToneStartRef = useRef<Promise<DroneHandle> | null>(null)
  const pitchToneActiveRef = useRef(false)
  const previewConcertMidiRef = useRef<number | null>(null)
  const previewStopTimerRef = useRef<number | null>(null)

  const stopPitchPreview = useCallback(() => {
    pitchToneActiveRef.current = false
    previewConcertMidiRef.current = null
    if (previewStopTimerRef.current !== null) {
      window.clearTimeout(previewStopTimerRef.current)
      previewStopTimerRef.current = null
    }
    const tone = pitchToneRef.current
    pitchToneRef.current = null
    void tone?.stop()
    // Keep the speaker tail out of the live pitch detector.
    suppressUntilRef.current = performance.now() + 380
  }, [suppressUntilRef])

  const playPitchPreview = useCallback((writtenMidi: number, autoStopMs?: number) => {
    const concertMidi = Math.round(
      writtenMidiToConcertMidi(writtenMidi, instrument.transposition),
    )
    const previousConcertMidi = previewConcertMidiRef.current
    previewConcertMidiRef.current = concertMidi
    pitchToneActiveRef.current = true

    if (previewStopTimerRef.current !== null) {
      window.clearTimeout(previewStopTimerRef.current)
      previewStopTimerRef.current = null
    }
    if (autoStopMs !== undefined) {
      previewStopTimerRef.current = window.setTimeout(stopPitchPreview, autoStopMs)
    }
    suppressUntilRef.current = performance.now() + (autoStopMs ?? 60_000) + 380

    const pitchClass = ((concertMidi % 12) + 12) % 12
    const octave = Math.floor(concertMidi / 12) - 1
    const activeTone = pitchToneRef.current
    if (activeTone) {
      if (previousConcertMidi !== concertMidi) {
        void activeTone.setPitch(pitchClass, octave)
      }
      return
    }

    if (pitchToneStartRef.current) return
    const pendingTone = startBalanceTone(concertMidi, 1)
    pitchToneStartRef.current = pendingTone
    void pendingTone
      .then((tone) => {
        if (pitchToneStartRef.current === pendingTone) pitchToneStartRef.current = null
        if (!pitchToneActiveRef.current) {
          void tone.stop()
          return
        }
        pitchToneRef.current = tone
        const desiredMidi = previewConcertMidiRef.current
        if (desiredMidi !== null && desiredMidi !== concertMidi) {
          const desiredPitchClass = ((desiredMidi % 12) + 12) % 12
          const desiredOctave = Math.floor(desiredMidi / 12) - 1
          void tone.setPitch(desiredPitchClass, desiredOctave)
        }
      })
      .catch(() => {
        if (pitchToneStartRef.current === pendingTone) pitchToneStartRef.current = null
      })
  }, [instrument.transposition, stopPitchPreview, suppressUntilRef])

  useEffect(() => stopPitchPreview, [stopPitchPreview])

  const setTargetMidi = (midi: number): number => {
    const clamped = Math.max(targetMin, Math.min(targetMax, Math.round(midi)))
    if (clamped === targetMidi) return clamped
    if (settings.routineType === 'scale') {
      onUpdate({ scale: { ...settings.scale, rootWrittenMidi: clamped } })
    } else {
      onUpdate({ single: { ...settings.single, writtenMidi: clamped } })
    }
    return clamped
  }

  const previewVisualRef = useRef({
    cents: 0,
    progress: 0,
    speed: 0,
    balancedMs: 0,
    confidentMs: 0,
    pitchPresent: false,
  })
  const [previewHeldMs, setPreviewHeldMs] = useState(0)
  const previewHeldMsRef = useRef(0)
  const previewInputRef = useRef({ readout, previewTarget, tolerance, goalMs: 1 })
  const fixedGoalMs = settings.goalSeconds * 1000
  const previewGoalMs = settings.goalMode === 'personalBest'
    ? Math.max(fixedGoalMs, bestBalancedMs || fixedGoalMs)
    : fixedGoalMs
  previewInputRef.current = { readout, previewTarget, tolerance, goalMs: previewGoalMs }

  useEffect(() => {
    previewHeldMsRef.current = 0
    setPreviewHeldMs(0)
    previewVisualRef.current = {
      cents: 0,
      progress: 0,
      speed: 0,
      balancedMs: 0,
      confidentMs: 0,
      pitchPresent: false,
    }
  }, [previewTarget?.id])

  useEffect(() => {
    let lastAt = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsed = Math.min(160, Math.max(0, now - lastAt))
      lastAt = now
      const input = previewInputRef.current
      const pitchPresent = input.readout.noteName !== '—' && input.readout.frequencyHz > 0
      const cents = input.previewTarget
        ? centsFromConcertTarget(
            input.readout.midi,
            input.readout.cents,
            input.previewTarget.concertMidi,
          )
        : 0
      const targetPitchPresent = pitchPresent && Math.abs(cents) < 50
      const inWindow = targetPitchPresent && Math.abs(cents) <= input.tolerance
      const nextHeldMs = inWindow
        ? Math.min(input.goalMs, previewHeldMsRef.current + elapsed)
        : Math.max(0, previewHeldMsRef.current - elapsed * (targetPitchPresent ? 0.35 : 0.18))

      previewHeldMsRef.current = nextHeldMs
      previewVisualRef.current.cents = cents
      previewVisualRef.current.progress = Math.min(1, nextHeldMs / Math.max(1, input.goalMs))
      previewVisualRef.current.speed = targetPitchPresent
        ? movementSpeedForCents(cents, input.tolerance)
        : 0
      previewVisualRef.current.balancedMs = nextHeldMs
      previewVisualRef.current.confidentMs = nextHeldMs
      previewVisualRef.current.pitchPresent = targetPitchPresent

      const displayMs = Math.round(nextHeldMs / 100) * 100
      setPreviewHeldMs((current) => current === displayMs ? current : displayMs)
    }, 80)
    return () => window.clearInterval(timer)
  }, [])

  const previewCents = previewTarget && hasPitch
    ? centsFromConcertTarget(readout.midi, readout.cents, previewTarget.concertMidi)
    : null
  const previewInTune = previewCents !== null && Math.abs(previewCents) <= tolerance
  const targetLabel = previewTarget?.writtenLabel ?? midiToBalanceNoteName(targetMidi)
  const goalLabel = settings.goalMode === 'personalBest' ? 'Beat best' : `${settings.goalSeconds} sec`
  const goalIndex = balanceGoalIndex(settings.goalSeconds)
  const destination = balanceDestinationGeometry(settings.goalSeconds)
  const pitchRatio = targetMax > targetMin ? (targetMidi - targetMin) / (targetMax - targetMin) : 0.5
  const toleranceRatio = (tolerance - 3) / 27
  const routineLabel = settings.routineType === 'custom'
    ? selectedCustom?.name ?? 'Choose a custom routine'
    : routineSummary(settings, customRoutines)

  const updatePitchFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!targetCanChange) return
    const ratio = pointerRatio(event, 'vertical')
    const nextMidi = setTargetMidi(targetMin + ratio * (targetMax - targetMin))
    playPitchPreview(nextMidi)
  }

  const updateToleranceFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const ratio = pointerRatio(event, 'horizontal')
    onUpdate({
      tolerancePreset: 'custom',
      customToleranceCents: Math.round(3 + ratio * 27),
    })
  }

  const setGoalIndex = (index: number) => {
    const clampedIndex = Math.max(0, Math.min(BALANCE_GOAL_OPTIONS.length - 1, index))
    const goalSeconds = BALANCE_GOAL_OPTIONS[clampedIndex] ?? 10
    if (goalSeconds === settings.goalSeconds && settings.goalMode === 'fixed') return
    onUpdate({ goalMode: 'fixed', goalSeconds })
  }

  const updateGoalFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scene = previewSceneRef.current
    if (!scene) return
    const rect = scene.getBoundingClientRect()
    const pointerX = (event.clientX - rect.left) / Math.max(1, rect.width) * 100
    const pointerY = (event.clientY - rect.top) / Math.max(1, rect.height) * 100
    const close = balanceDestinationGeometry(BALANCE_GOAL_OPTIONS[0])
    const far = balanceDestinationGeometry(BALANCE_GOAL_OPTIONS[BALANCE_GOAL_OPTIONS.length - 1])
    const vectorX = far.x - close.x
    const vectorY = far.y - close.y
    const projectedRatio = (
      (pointerX - close.x) * vectorX + (pointerY - close.y) * vectorY
    ) / (vectorX * vectorX + vectorY * vectorY)
    const nextIndex = Math.round(
      Math.max(0, Math.min(1, projectedRatio)) * (BALANCE_GOAL_OPTIONS.length - 1),
    )
    setGoalIndex(nextIndex)
  }

  const handlePitchKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!targetCanChange) return
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      playPitchPreview(setTargetMidi(targetMidi + 1), 720)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      playPitchPreview(setTargetMidi(targetMidi - 1), 720)
    } else if (event.key === 'Home') {
      event.preventDefault()
      playPitchPreview(setTargetMidi(targetMin), 720)
    } else if (event.key === 'End') {
      event.preventDefault()
      playPitchPreview(setTargetMidi(targetMax), 720)
    }
  }

  const handleToleranceKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
        ? -1
        : 0
    if (delta === 0) return
    event.preventDefault()
    onUpdate({
      tolerancePreset: 'custom',
      customToleranceCents: Math.max(3, Math.min(30, tolerance + delta)),
    })
  }

  const handleGoalKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowRight'
      ? 1
      : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
        ? -1
        : 0
    if (delta !== 0) {
      event.preventDefault()
      setGoalIndex(goalIndex + delta)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setGoalIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setGoalIndex(BALANCE_GOAL_OPTIONS.length - 1)
    }
  }

  return (
    <div className="balance-screen balance-screen--setup">
      <header className="balance-head">
        <Pressable intensity="icon" hapticFeedback={hapticFeedback} onClick={onBack} aria-label="Back to Practice Games">
          <ArrowLeft aria-hidden />
        </Pressable>
        <div><h1>Balance</h1><p>Long tones</p></div>
        <p className="balance-head__best"><small>Best</small><strong>{bestBalancedMs > 0 ? formatBalanceDuration(bestBalancedMs) : '—'}</strong></p>
      </header>

      <section className="balance-setup-preview">
        <div
          ref={previewSceneRef}
          className="balance-setup-preview__scene"
          onPointerMove={(event) => {
            if (distancePointerIdRef.current === event.pointerId) updateGoalFromPointer(event)
          }}
          onPointerUp={(event) => {
            if (distancePointerIdRef.current !== event.pointerId) return
            distancePointerIdRef.current = null
            setDistanceDragging(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
          }}
          onPointerCancel={(event) => {
            if (distancePointerIdRef.current !== event.pointerId) return
            distancePointerIdRef.current = null
            setDistanceDragging(false)
          }}
        >
          {/* The real game renderer, held at its idle frame — the setup screen
              and the run you are about to play are the same world at the same
              angle, not a flat drawing of it. */}
          <BalanceScene
            phase="setup"
            target={previewTarget}
            visualRef={previewVisualRef}
            characterId={settings.characterId}
            toleranceCents={tolerance}
            goalSeconds={settings.goalSeconds}
          />

          <div
            className={`balance-preview-distance-control ${distanceDragging ? 'is-dragging' : ''}`}
            role="slider"
            tabIndex={0}
            aria-label="Hold duration by destination distance"
            aria-valuemin={BALANCE_GOAL_OPTIONS[0]}
            aria-valuemax={BALANCE_GOAL_OPTIONS[BALANCE_GOAL_OPTIONS.length - 1]}
            aria-valuenow={settings.goalSeconds}
            aria-valuetext={goalLabel}
            style={{
              left: `${destination.x}%`,
              top: `${destination.y - 1.2}%`,
            }}
            onKeyDown={handleGoalKey}
            onPointerDown={(event) => {
              distancePointerIdRef.current = event.pointerId
              setDistanceDragging(true)
              previewSceneRef.current?.setPointerCapture(event.pointerId)
              updateGoalFromPointer(event)
            }}
          >
            <output>{goalLabel}</output>
            <span aria-hidden>Drag distance ↗</span>
          </div>

          {targetCanChange ? (
            <div
              className="balance-preview-pitch-control"
              role="slider"
              tabIndex={0}
              aria-label="Target pitch"
              aria-orientation="vertical"
              aria-valuemin={targetMin}
              aria-valuemax={targetMax}
              aria-valuenow={targetMidi}
              aria-valuetext={targetLabel}
              onKeyDown={handlePitchKey}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                updatePitchFromPointer(event)
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  updatePitchFromPointer(event)
                }
              }}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId)
                stopPitchPreview()
              }}
              onPointerCancel={stopPitchPreview}
            >
              <small>Drag pitch</small>
              <span className="balance-preview-pitch-control__rail" aria-hidden />
              <output
                className="balance-preview-pitch-control__thumb"
                style={{ top: `${(1 - pitchRatio) * 100}%` }}
              >{targetLabel}</output>
            </div>
          ) : (
            <Pressable
              intensity="soft"
              hapticFeedback={hapticFeedback}
              className="balance-preview-edit-routine"
              onClick={() => setOpenSection('routine')}
            >Edit routine</Pressable>
          )}

          <div
            className="balance-preview-rope-control"
            role="slider"
            tabIndex={0}
            aria-label="Rope width and pitch tolerance"
            aria-valuemin={3}
            aria-valuemax={30}
            aria-valuenow={tolerance}
            aria-valuetext={`plus or minus ${tolerance} cents`}
            style={{
              ['--balance-rope-control-width' as string]: `${1.5 + toleranceRatio * 3}rem`,
            }}
            onKeyDown={handleToleranceKey}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              updateToleranceFromPointer(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                updateToleranceFromPointer(event)
              }
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          >
            <output>Drag rope · ±{tolerance}¢</output>
            <span aria-hidden><i /><b /><i /></span>
          </div>
        </div>
        <div className="balance-preview-summary">
          <span>
            <small>{previewInTune ? 'In tune' : 'Live setup'}</small>
            <strong>{routineLabel}</strong>
          </span>
          <button
            type="button"
            className={`balance-preview-best-goal ${settings.goalMode === 'personalBest' ? 'is-active' : ''}`}
            aria-pressed={settings.goalMode === 'personalBest'}
            onClick={() => onUpdate({
              goalMode: settings.goalMode === 'personalBest' ? 'fixed' : 'personalBest',
            })}
          >{settings.goalMode === 'personalBest' ? 'Using best' : 'Beat best'}</button>
          <p className={previewInTune ? 'is-growing' : ''} aria-live="polite">
            {previewInTune
              ? `Growing · ${(previewHeldMs / 1000).toFixed(1)}s`
              : `Play ${targetLabel} to grow the rope`}
          </p>
        </div>
      </section>

      <div className="balance-setup-sheet">
        {/* Above Start, not below it: these were off the bottom of the screen
            and a new player had no reason to scroll past a big Start button to
            find out the game was configurable at all. Closed they sit two-up;
            the open one takes the full width. */}
        <div className="balance-setup-quick">
      <SetupGroup
        id="routine"
        open={openSection === 'routine'}
        title="Routine"
        summary={routineSummary(settings, customRoutines)}
        hapticFeedback={hapticFeedback}
        onToggle={(id) => setOpenSection(openSection === id ? null : id)}
      >
        <div className="balance-choice-row" role="radiogroup" aria-label="Routine type">
          {(['single', 'scale', 'custom'] as const).map((type) => (
            <Pressable
              key={type}
              intensity="soft"
              hapticFeedback={hapticFeedback}
              className={settings.routineType === type ? 'is-selected' : ''}
              onClick={() => onUpdate({ routineType: type })}
              role="radio"
              aria-checked={settings.routineType === type}
            >{type === 'single' ? 'Single Note' : type === 'scale' ? 'Scale' : 'Custom'}</Pressable>
          ))}
        </div>

        {settings.routineType === 'single' && (
          <label className="balance-setting-row" htmlFor="balance-repetitions"><span>Repetitions</span>
            <select id="balance-repetitions" value={settings.single.repetitions} onChange={(event) => onUpdate({ single: { ...settings.single, repetitions: Number(event.target.value) } })}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        )}

        {settings.routineType === 'scale' && (
          <>
            <label className="balance-setting-row" htmlFor="balance-scale-type"><span>Scale type</span>
              <select id="balance-scale-type" value={settings.scale.scaleType} onChange={(event) => onUpdate({ scale: { ...settings.scale, scaleType: event.target.value as BalanceScaleType } })}>
                {(Object.keys(BALANCE_SCALE_TYPE_LABELS) as BalanceScaleType[]).map((type) => <option key={type} value={type}>{BALANCE_SCALE_TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label className="balance-setting-row" htmlFor="balance-scale-direction"><span>Direction</span>
              <select id="balance-scale-direction" value={settings.scale.direction} onChange={(event) => onUpdate({ scale: { ...settings.scale, direction: event.target.value as BalanceScaleDirection } })}>
                {(Object.keys(BALANCE_DIRECTION_LABELS) as BalanceScaleDirection[]).map((direction) => <option key={direction} value={direction}>{BALANCE_DIRECTION_LABELS[direction]}</option>)}
              </select>
            </label>
            <label className="balance-setting-row" htmlFor="balance-octaves"><span>Octave range</span>
              <select id="balance-octaves" value={settings.scale.octaveRange} onChange={(event) => {
                const octaveRange = Number(event.target.value) as 1 | 2
                onUpdate({ scale: { ...settings.scale, octaveRange, rootWrittenMidi: Math.min(settings.scale.rootWrittenMidi, instrument.maxWrittenMidi - octaveRange * 12) } })
              }}>
                <option value={1}>1 octave</option>
                <option value={2} disabled={instrument.maxWrittenMidi - instrument.minWrittenMidi < 24}>2 octaves</option>
              </select>
            </label>
            <label className="balance-setting-row" htmlFor="balance-scale-repetitions"><span>Repetitions</span>
              <select id="balance-scale-repetitions" value={settings.scale.repetitions} onChange={(event) => onUpdate({ scale: { ...settings.scale, repetitions: Number(event.target.value) } })}>
                {[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          </>
        )}

        {settings.routineType === 'custom' && (
          <BalanceRoutineEditor
            instrument={instrument}
            routines={customRoutines}
            selectedId={settings.selectedCustomRoutineId}
            hapticFeedback={hapticFeedback}
            onSelect={(selectedCustomRoutineId) => onUpdate({ selectedCustomRoutineId })}
            onSave={onSaveCustom}
            onDelete={onDeleteCustom}
          />
        )}
      </SetupGroup>

      <SetupGroup
        id="instrument"
        open={openSection === 'instrument'}
        title="Instrument"
        summary={`${instrument.name} · ${instrument.clef[0]?.toUpperCase()}${instrument.clef.slice(1)} clef · Written pitch`}
        hapticFeedback={hapticFeedback}
        onToggle={(id) => setOpenSection(openSection === id ? null : id)}
      >
        <label className="balance-setting-row" htmlFor="balance-instrument"><span>Instrument</span>
          <select
            id="balance-instrument"
            value={instrument.id}
            onChange={(event) => {
              const nextInstrument = getBalanceInstrument(event.target.value)
              onUpdate({
                instrumentId: nextInstrument.id,
                single: { ...settings.single, writtenMidi: clampWrittenMidi(settings.single.writtenMidi, nextInstrument) },
                scale: {
                  ...settings.scale,
                  rootWrittenMidi: Math.min(
                    clampWrittenMidi(settings.scale.rootWrittenMidi, nextInstrument),
                    nextInstrument.maxWrittenMidi - settings.scale.octaveRange * 12,
                  ),
                },
              })
            }}
          >
            {BALANCE_INSTRUMENTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="balance-instrument-facts">
          <span>Transposition<strong>{instrument.transposition === 'concert' ? 'Concert C' : instrument.transposition.replace('_', ' · ')}</strong></span>
          <span>Written range<strong>{midiToBalanceNoteName(instrument.minWrittenMidi)}–{midiToBalanceNoteName(instrument.maxWrittenMidi)}</strong></span>
          <span>Current target<strong>{previewTarget ? `Written ${previewTarget.writtenLabel} · Concert ${previewTarget.concertLabel}` : '—'}</strong></span>
        </div>
      </SetupGroup>
        </div>

        <div className="balance-start">
          <Pressable
            haptic="medium"
            hapticFeedback={hapticFeedback}
            className="balance-primary-button"
            onClick={() => {
              stopPitchPreview()
              onRequestMic()
              onStart()
            }}
            disabled={settings.routineType === 'custom' && !selectedCustom}
          ><Play aria-hidden /> Start</Pressable>
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            onClick={onRequestMic}
            className={`balance-mic-check ${hasPitch ? 'is-live' : ''} ${permissionBlocked ? 'is-error' : ''}`}
          >
            <Mic aria-hidden />
            <span>{micLabel}<small>Nothing is recorded or stored.</small></span>
            <strong>{hasPitch ? `${readout.noteName} ${Math.round(readout.cents) >= 0 ? '+' : ''}${Math.round(readout.cents)}¢` : '—'}</strong>
          </Pressable>
        </div>



      </div>
    </div>
  )
}
