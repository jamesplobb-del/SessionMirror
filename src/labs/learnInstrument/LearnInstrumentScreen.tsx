import { useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Mic, Play, RotateCcw } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import {
  useLivePitchTracker,
  type PitchSourceHealth,
} from '../../hooks/useLivePitchTracker'
import { midiToNoteName } from '../../utils/pitchUtils'
import FingeringChart from './FingeringChart'
import NoteStaff from './NoteStaff'
import { useLearnInstrumentGame } from './useLearnInstrumentGame'
import {
  INSTRUMENT_GROUPS,
  LESSON_GOALS,
  getInstrument,
  type StaffPitch,
} from './instrumentData'
import './learn-instrument.css'

interface LearnInstrumentScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  hapticFeedback: boolean
  micPermissionBlocked: boolean
  micPermissionPending: boolean
  onRequestMicStream: () => void
  onReleaseMicStream: () => void
  onBack: () => void
}

/** Past this many notes a row of dots stops being readable, so it becomes a bar. */
const DOTS_LIMIT = 14

/**
 * Which pitches the staff should reserve room for.
 *
 * A short lesson sizes to all of it, so the staff never moves. A chromatic run
 * spans three octaves, and reserving room for every ledger line at both ends
 * would shrink the staff to nothing — so it sizes to the notes either side of
 * where the student is, which holds still for a stretch at a time.
 */
function sizingWindow(
  targets: readonly { staff: StaffPitch }[],
  index: number,
): StaffPitch[] {
  if (targets.length <= DOTS_LIMIT) return targets.map((note) => note.staff)
  const from = Math.max(0, index - 6)
  return targets.slice(from, from + 13).map((note) => note.staff)
}

/** Charts drawn as a row rather than a column only need their own height. */
const WIDE_CHARTS = ['flute', 'valves', 'slide']

/** "F♯5" reads as "F♯" on the card — the staff already says which octave. */
function noteLetter(writtenLabel: string): string {
  return writtenLabel.replace(/\d+$/, '')
}

/**
 * The detector reports concert pitch, but a clarinet or sax student reads a
 * transposed part. Report back what they played in the pitch they are reading,
 * octave included — being an octave out is the classic beginner miss, and the
 * number is what tells them.
 */
function heardAsWritten(
  concertMidi: number | null,
  transpositionSemitones: number,
): string | null {
  if (concertMidi == null) return null
  return midiToNoteName(concertMidi - transpositionSemitones).replace('#', '♯')
}

export default function LearnInstrumentScreen({
  streamRef,
  streamGeneration,
  hapticFeedback,
  micPermissionBlocked,
  micPermissionPending,
  onRequestMicStream,
  onReleaseMicStream,
  onBack,
}: LearnInstrumentScreenProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [sourceHealth, setSourceHealth] = useState<PitchSourceHealth>('idle')
  const game = useLearnInstrumentGame({ hapticFeedback })
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const previousPhaseRef = useRef(game.state.phase)

  const sharedMicReady = Boolean(
    streamRef.current?.getAudioTracks().some((track) => track.readyState === 'live'),
  )
  const pitchEnabled =
    game.state.phase !== 'complete' && (sharedMicReady || micPermissionPending)

  const { readout } = useLivePitchTracker(
    mediaRef,
    pitchEnabled,
    pitchEnabled,
    `learn-instrument-${streamGeneration}-${game.state.instrumentId}`,
    canvasRef,
    'solid',
    {
      source: 'microphone',
      micStreamRef: streamRef,
      tunerInstrument: 'winds',
      realtimeMode: true,
      continuousScroll: false,
      onSourceHealthChange: setSourceHealth,
      onAcceptedPitchFrame: game.handleAcceptedPitchFrame,
    },
  )

  useEffect(() => {
    const previousPhase = previousPhaseRef.current
    previousPhaseRef.current = game.state.phase
    if (previousPhase === game.state.phase) return
    const focusFrame = window.requestAnimationFrame(() => headingRef.current?.focus())
    return () => window.cancelAnimationFrame(focusFrame)
  }, [game.state.phase])

  useEffect(() => {
    if (game.state.phase === 'complete') onReleaseMicStream()
  }, [game.state.phase, onReleaseMicStream])

  const hasPitch = readout.noteName !== '—' && readout.frequencyHz > 0
  const micTrouble = micPermissionBlocked || sourceHealth === 'stalled'
  const micConnecting = micPermissionPending || sourceHealth === 'connecting'

  const handleStart = () => {
    onRequestMicStream()
    game.start()
  }

  const handleRestart = () => {
    onRequestMicStream()
    game.restart()
  }

  /* ── Finished ────────────────────────────────────────────────────────── */
  if (game.state.phase === 'complete') {
    return (
      <main className="li-screen li-done">
        <span className="li-done__tick" aria-hidden>
          <Check />
        </span>
        <h1 ref={headingRef} tabIndex={-1}>
          You played them all.
        </h1>
        <p>
          {game.totalTargetCount} notes on {game.selectedInstrument.name}, every one heard in
          tune.
        </p>
        <div className="li-done__actions">
          <Pressable
            haptic="medium"
            hapticFeedback={hapticFeedback}
            className="li-button li-button--primary"
            onClick={handleRestart}
          >
            <RotateCcw aria-hidden /> Play again
          </Pressable>
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            className="li-button"
            onClick={game.backToSetup}
          >
            Pick another instrument
          </Pressable>
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            className="li-button li-button--quiet"
            onClick={onBack}
          >
            Back to games
          </Pressable>
        </div>
      </main>
    )
  }

  /* ── Setup ───────────────────────────────────────────────────────────── */
  if (game.state.phase === 'setup') {
    const micLabel = micPermissionBlocked
      ? 'Microphone is off — tap to allow it'
      : micConnecting
        ? 'Connecting your microphone…'
        : sourceHealth === 'stalled'
          ? 'Microphone unavailable — tap to retry'
          : hasPitch
            ? `Hearing ${readout.noteName}`
            : 'Play a note to test your microphone'

    return (
      <main className="li-screen li-setup">
        <header className="li-setup__head">
          <Pressable
            intensity="icon"
            hapticFeedback={hapticFeedback}
            className="li-icon-button"
            onClick={onBack}
            aria-label="Back to Practice Games"
          >
            <ArrowLeft aria-hidden />
          </Pressable>
          <h1 ref={headingRef} tabIndex={-1}>
            Learn Your Instrument
          </h1>
        </header>

        <div className="li-setup__body">
          <section className="li-step" aria-labelledby="li-step-instrument">
            <h2 id="li-step-instrument">
              <span className="li-step__number" aria-hidden>
                1
              </span>
              Pick your instrument
            </h2>

            {INSTRUMENT_GROUPS.map((group) => (
              <div key={group.id} className="li-picker">
                <h3>{group.label}</h3>
                <div className="li-picker__grid" role="radiogroup" aria-label={group.label}>
                  {group.instrumentIds.map((instrumentId) => {
                    const instrument = getInstrument(instrumentId)
                    if (!instrument) return null
                    const selected = game.state.instrumentId === instrument.id
                    return (
                      <Pressable
                        key={instrument.id}
                        intensity="soft"
                        hapticFeedback={hapticFeedback}
                        className={`li-choice ${selected ? 'is-selected' : ''}`}
                        role="radio"
                        aria-checked={selected}
                        onClick={() => game.selectInstrument(instrument.id)}
                      >
                        {instrument.shortName}
                      </Pressable>
                    )
                  })}
                </div>
              </div>
            ))}
          </section>

          <section className="li-step" aria-labelledby="li-step-goal">
            <h2 id="li-step-goal">
              <span className="li-step__number" aria-hidden>
                2
              </span>
              Pick your goal
            </h2>

            <div className="li-goals" role="radiogroup" aria-label="Goal">
              {LESSON_GOALS.map((goal) => {
                const selected = game.state.goalId === goal.id
                return (
                  <Pressable
                    key={goal.id}
                    intensity="soft"
                    hapticFeedback={hapticFeedback}
                    className={`li-goal ${selected ? 'is-selected' : ''}`}
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${goal.title}. ${goal.description}`}
                    onClick={() => game.selectGoal(goal.id)}
                  >
                    <span className="li-goal__copy">
                      <strong>{goal.title}</strong>
                      <small>{goal.description}</small>
                    </span>
                    <span className="li-goal__tick" aria-hidden>
                      {selected ? <Check /> : null}
                    </span>
                  </Pressable>
                )
              })}
            </div>

            <p className="li-step__note">
              {game.totalTargetCount} notes · {game.selectedCourse.description} ·{' '}
              {game.selectedInstrument.clef} clef
            </p>
          </section>
        </div>

        <footer className="li-setup__foot">
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            onClick={onRequestMicStream}
            aria-label={`${micLabel}. Tap to reconnect the microphone.`}
            className={`li-mic ${hasPitch ? 'is-live' : ''} ${micTrouble ? 'is-error' : ''}`}
          >
            <Mic aria-hidden />
            <span>{micLabel}</span>
          </Pressable>
          <Pressable
            haptic="medium"
            hapticFeedback={hapticFeedback}
            className="li-button li-button--primary li-button--wide"
            onClick={handleStart}
            disabled={micPermissionPending}
          >
            <Play aria-hidden />
            {micPermissionPending ? 'Connecting…' : 'Start'}
          </Pressable>
        </footer>
      </main>
    )
  }

  /* ── Playing ─────────────────────────────────────────────────────────── */
  const target = game.currentTarget
  if (!target) return null

  const wideChart = WIDE_CHARTS.includes(game.selectedInstrument.chartKind)
  const status = micTrouble
    ? 'error'
    : micConnecting
      ? 'connecting'
      : game.state.detectedStatus

  const statusText = micPermissionBlocked
    ? 'Microphone is off'
    : sourceHealth === 'stalled'
      ? 'Microphone unavailable'
      : micConnecting
        ? 'Connecting…'
        : status === 'correct'
          ? 'That’s it!'
          : status === 'holding'
            ? 'Hold it…'
            : status === 'wrong'
              ? `Heard ${
                  heardAsWritten(
                    game.state.detectedMidi,
                    game.selectedInstrument.transpositionSemitones,
                  ) ?? readout.noteName
                } — try again`
              : 'Listening…'

  return (
    <main className="li-screen li-play" data-status={status}>
      <h1 ref={headingRef} className="li-sr-only" tabIndex={-1}>
        {game.selectedInstrument.name}: play {target.writtenLabel}
      </h1>

      <header className="li-play__head">
        <Pressable
          intensity="icon"
          hapticFeedback={hapticFeedback}
          className="li-icon-button"
          onClick={game.backToSetup}
          aria-label="Back to setup"
        >
          <ArrowLeft aria-hidden />
        </Pressable>
        <Pressable
          intensity="icon"
          hapticFeedback={hapticFeedback}
          className="li-icon-button li-step-button"
          onClick={game.goToPreviousNote}
          disabled={game.state.targetIndex === 0}
          aria-label="Previous note"
        >
          <ChevronLeft aria-hidden />
        </Pressable>

        <span
          className={game.totalTargetCount > DOTS_LIMIT ? 'li-progress' : 'li-dots'}
          role="progressbar"
          aria-label="Lesson progress"
          aria-valuemin={0}
          aria-valuemax={game.totalTargetCount}
          aria-valuenow={game.completedTargetCount}
        >
          {game.totalTargetCount > DOTS_LIMIT ? (
            <>
              <i
                className="li-progress__done"
                style={{
                  width: `${(game.completedTargetCount / game.totalTargetCount) * 100}%`,
                }}
              />
              <i
                className="li-progress__here"
                style={{
                  left: `${((game.state.targetIndex + 0.5) / game.totalTargetCount) * 100}%`,
                }}
              />
            </>
          ) : (
            game.targets.map((note, index) => (
              <i
                key={note.id}
                data-state={
                  index === game.state.targetIndex
                    ? 'now'
                    : game.completedIndices.includes(index)
                      ? 'done'
                      : 'todo'
                }
              />
            ))
          )}
        </span>

        <Pressable
          intensity="icon"
          hapticFeedback={hapticFeedback}
          className="li-icon-button li-step-button"
          onClick={game.goToNextNote}
          disabled={game.state.targetIndex >= game.totalTargetCount - 1}
          aria-label="Next note"
        >
          <ChevronRight aria-hidden />
        </Pressable>

        <span className="li-count">
          {Math.min(game.state.targetIndex + 1, game.totalTargetCount)}/{game.totalTargetCount}
        </span>
      </header>

      <div className="li-play__body" data-chart-shape={wideChart ? 'row' : 'column'}>
        <section className="li-card li-card--note">
          <p className="li-card__title">Play this note</p>
          <strong className="li-note-name">{noteLetter(target.writtenLabel)}</strong>
          <NoteStaff
            clef={game.selectedInstrument.clef}
            note={target.staff}
            sizingNotes={sizingWindow(game.targets, game.state.targetIndex)}
            label={`${target.writtenLabel} on the ${game.selectedInstrument.clef} staff`}
          />
        </section>

        <section
          className={`li-card li-card--chart ${wideChart ? 'is-wide' : ''}`}
        >
          <p className="li-card__title">Use this fingering</p>
          <FingeringChart instrument={game.selectedInstrument} note={target} />
          <p className="li-recipe">{target.recipe}</p>
        </section>
      </div>

      <footer className="li-listen">
        <span className="li-listen__icon" aria-hidden>
          {status === 'correct' ? <Check /> : <Mic />}
        </span>
        <span className="li-listen__text" aria-live="polite">
          {statusText}
        </span>
        {micTrouble ? (
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            onClick={onRequestMicStream}
            className="li-listen__retry"
          >
            Retry
          </Pressable>
        ) : (
          <span className="li-listen__meter" aria-hidden>
            <i style={{ width: `${game.state.holdProgress * 100}%` }} />
          </span>
        )}
      </footer>
    </main>
  )
}
