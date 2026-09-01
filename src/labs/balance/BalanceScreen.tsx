import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { useGameMicRecovery, type GameMicRequest } from '../useGameMicRecovery'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'
import { useLivePitchTracker, type PitchSourceHealth } from '../../hooks/useLivePitchTracker'
import { GAME_TEST_INPUT, syntheticReadout, TEST_HOLD_FRAME_MS } from '../gameTestInput'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from './BalanceArcadeShell'
import BalanceHome from './BalanceHome'
import BalanceInstrumentPicker from './BalanceInstrumentPicker'
import BalanceLevelResults from './BalanceLevelResults'
import BalanceQuickPlay from './BalanceQuickPlay'
import BalanceResults from './BalanceResults'
import BalanceScene from './BalanceScene'
import BalanceStaffNote from './BalanceStaffNote'
import BalanceSetup from './BalanceSetup'
import BalanceTrail from './BalanceTrail'
import BalanceTrophyCase from './BalanceTrophyCase'
import {
  buildBalanceTargets,
  clampWrittenMidi,
  getBalanceInstrument,
  inferBalanceInstrument,
} from './balanceMusic'
import { loadPracticeGameInstrumentId } from '../practiceGameInstrument'
import {
  balanceCurrentStreak,
  balanceDailyChallenge,
  balanceDailyLaunch,
} from './balanceDaily'
import {
  balanceLevelLaunch,
  getBalanceLevel,
  BALANCE_LEVELS,
  type BalanceLevel,
} from './balanceLevels'
import { centsFromConcertTarget } from './balanceScoring'
import { formatBalanceDuration } from './balanceStorage'
import { balanceInstrumentSettings, QUICK_PLAY_LAUNCH, useBalanceGame } from './useBalanceGame'
import './balance.css'
import './balance-arcade.css'

/** Where the player is when no run is in progress. */
type BalanceRoute = 'home' | 'trail' | 'quick' | 'options' | 'trophies' | 'instrument'

interface BalanceScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  micPermissionBlocked: boolean
  micPermissionPending: boolean
  onRequestMicStream: GameMicRequest
  onBack: () => void
}

export default function BalanceScreen({
  streamRef,
  streamGeneration,
  tunerInstrument,
  tunerTransposition,
  hapticFeedback,
  micPermissionBlocked,
  micPermissionPending,
  onRequestMicStream,
  onBack,
}: BalanceScreenProps) {
  const initialInstrument = useMemo(
    () => {
      const saved = loadPracticeGameInstrumentId()
      return saved
        ? getBalanceInstrument(saved)
        : inferBalanceInstrument(tunerTransposition, tunerInstrument)
    },
    [tunerInstrument, tunerTransposition],
  )
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [sourceHealth, setSourceHealth] = useState<PitchSourceHealth>('idle')
  const [route, setRoute] = useState<BalanceRoute>('home')
  const game = useBalanceGame({
    initialInstrumentId: initialInstrument.id,
    hapticFeedback,
  })
  const selectedInstrument = balanceInstrumentSettings(game.state.settings.instrumentId)
  /*
   * Home, the trail and the trophy case have nothing to listen for, so the
   * microphone only comes up on the two screens that show a live readout and
   * for the run itself. Holding it open across the whole menu tree drained the
   * battery for nothing.
   */
  const pitchEnabled =
    (game.state.phase === 'setup' && (route === 'quick' || route === 'options')) ||
    game.state.phase === 'countIn' ||
    game.state.phase === 'waitingForPitch' ||
    game.state.phase === 'pitchLock' ||
    game.state.phase === 'active'

  /*
   * Coming back from the background, the stream is usually dead while
   * still looking present. This re-acquires it and, through the epoch in
   * the tracker key below, rebuilds the analysis graph on top of it —
   * without which the game returns to a suspended AudioContext and hears
   * nothing at all.
   */
  const micEpoch = useGameMicRecovery(pitchEnabled, onRequestMicStream)

  const { readout } = useLivePitchTracker(
    mediaRef,
    pitchEnabled,
    pitchEnabled,
    `balance-${streamGeneration}-${micEpoch}-${game.state.settings.instrumentId}`,
    canvasRef,
    'solid',
    {
      source: 'microphone',
      micStreamRef: streamRef,
      tunerInstrument: selectedInstrument.tunerInstrument,
      realtimeMode: true,
      continuousScroll: false,
      allowStandaloneMicFallback: true,
      suppressUntilRef: game.suppressUntilRef,
      onSourceHealthChange: setSourceHealth,
      onAcceptedPitchFrame: game.handleAcceptedPitchFrame,
    },
  )

  useEffect(() => {
    if (!pitchEnabled) return
    onRequestMicStream()
  }, [onRequestMicStream, pitchEnabled, streamGeneration])

  /**
   * Instrument-free testing: press and hold to sound the target note.
   *
   * Frames are pushed at roughly the rate the real detector delivers them, so
   * the lock-on, the tolerance band and the balance timer all run through
   * their normal path — the game cannot tell the difference between this and a
   * perfectly steady player.
   */
  const testHoldRef = useRef<number | null>(null)
  const targetConcertMidiRef = useRef<number | null>(null)
  targetConcertMidiRef.current = game.currentTarget?.concertMidi ?? null

  /**
   * The game object is rebuilt on every render, so it is reached through a ref
   * rather than closed over. Depending on it directly made these callbacks
   * change identity each render, which re-ran the unmount effect below and had
   * its cleanup cancel the hold a frame after it started — the press worked,
   * but exactly one frame ever reached the game.
   */
  const gameRef = useRef(game)
  gameRef.current = game

  const stopTestHold = useCallback(() => {
    if (testHoldRef.current == null) return
    window.clearInterval(testHoldRef.current)
    testHoldRef.current = null
    gameRef.current.handleAcceptedPitchFrame(null)
  }, [])

  const startTestHold = useCallback(() => {
    if (testHoldRef.current != null) return
    const pushFrame = () => {
      const midi = targetConcertMidiRef.current
      if (midi == null) return
      // Mute the real microphone for as long as the press lasts. Without this
      // the room's own noise keeps arriving between synthetic frames, reads as
      // wildly out of tune, and knocks the lock straight off again.
      gameRef.current.suppressUntilRef.current = performance.now() + TEST_HOLD_FRAME_MS * 4
      gameRef.current.handleAcceptedPitchFrame({
        readout: syntheticReadout(midi),
        confidence: 1,
        timestamp: Date.now(),
      })
    }
    pushFrame()
    testHoldRef.current = window.setInterval(pushFrame, TEST_HOLD_FRAME_MS)
  }, [])

  useEffect(() => stopTestHold, [stopTestHold])

  const previewTargets = useMemo(
    () => buildBalanceTargets(game.state.settings, game.customRoutines),
    [game.customRoutines, game.state.settings],
  )

  const startLevel = useCallback(
    (level: BalanceLevel) => {
      onRequestMicStream()
      gameRef.current.start(balanceLevelLaunch(level, gameRef.current.state.settings.instrumentId))
    },
    [onRequestMicStream],
  )

  const startDaily = useCallback(() => {
    onRequestMicStream()
    const settings = gameRef.current.state.settings
    gameRef.current.start(balanceDailyLaunch(balanceDailyChallenge(settings.instrumentId)))
  }, [onRequestMicStream])

  const startQuick = useCallback(() => {
    onRequestMicStream()
    gameRef.current.start(QUICK_PLAY_LAUNCH)
  }, [onRequestMicStream])

  /** Back to a menu screen without carrying the finished run's settings along. */
  const goTo = useCallback((next: BalanceRoute) => {
    gameRef.current.reset()
    setRoute(next)
  }, [])

  if (game.state.phase === 'setup') {
    if (route === 'home') {
      return (
        <BalanceHome
          instrumentId={game.state.settings.instrumentId}
          characterId={game.state.settings.characterId}
          levels={game.data.levels}
          daily={game.data.daily}
          trophyCount={Object.keys(game.data.trophies).length}
          bestBalancedMs={game.state.bestBalancedMs}
          hapticFeedback={hapticFeedback}
          onBack={onBack}
          onStartDaily={startDaily}
          onQuickPlay={() => setRoute('quick')}
          onTrail={() => setRoute('trail')}
          onTrophies={() => setRoute('trophies')}
          onInstrument={() => setRoute('instrument')}
        />
      )
    }

    if (route === 'trail') {
      return (
        <BalanceTrail
          instrumentId={game.state.settings.instrumentId}
          levels={game.data.levels}
          hapticFeedback={hapticFeedback}
          onBack={() => setRoute('home')}
          onPlayLevel={startLevel}
        />
      )
    }

    if (route === 'instrument') {
      return (
        <BalanceInstrumentPicker
          instrumentId={game.state.settings.instrumentId}
          hapticFeedback={hapticFeedback}
          onBack={() => setRoute('home')}
          onSelect={(instrumentId) => {
            // Changing horn moves every note, so the quick-play target has to
            // be pulled back into the new range or it would sit outside it.
            const next = getBalanceInstrument(instrumentId)
            game.updateSettings({
              instrumentId: next.id,
              single: {
                ...game.state.settings.single,
                writtenMidi: clampWrittenMidi(game.state.settings.single.writtenMidi, next),
              },
              scale: {
                ...game.state.settings.scale,
                rootWrittenMidi: Math.min(
                  clampWrittenMidi(game.state.settings.scale.rootWrittenMidi, next),
                  next.maxWrittenMidi - game.state.settings.scale.octaveRange * 12,
                ),
              },
            })
            setRoute('home')
          }}
        />
      )
    }

    if (route === 'trophies') {
      return (
        <BalanceArcadeShell
          title="Trophies"
          hapticFeedback={hapticFeedback}
          onBack={() => setRoute('home')}
          backLabel="Back to Balance home"
        >
          <h1 className="balance-display balance-display--page">Trophies</h1>
          <BalanceTrophyCase trophies={game.data.trophies} />
        </BalanceArcadeShell>
      )
    }

    if (route === 'quick') {
      return (
        <BalanceQuickPlay
          settings={game.state.settings}
          customRoutines={game.customRoutines}
          previewTarget={previewTargets[0] ?? null}
          bestBalancedMs={game.state.bestBalancedMs}
          readout={readout}
          sourceHealth={sourceHealth}
          permissionBlocked={micPermissionBlocked}
          permissionPending={micPermissionPending}
          hapticFeedback={hapticFeedback}
          onBack={() => setRoute('home')}
          onStart={startQuick}
          onOptions={() => setRoute('options')}
          onRequestMic={onRequestMicStream}
        />
      )
    }

    return (
      <BalanceSetup
        settings={game.state.settings}
        customRoutines={game.customRoutines}
        previewTarget={previewTargets[0] ?? null}
        bestBalancedMs={game.state.bestBalancedMs}
        readout={readout}
        sourceHealth={sourceHealth}
        permissionBlocked={micPermissionBlocked}
        permissionPending={micPermissionPending}
        hapticFeedback={hapticFeedback}
        suppressUntilRef={game.suppressUntilRef}
        onBack={() => setRoute('quick')}
        onStart={startQuick}
        onRequestMic={onRequestMicStream}
        onUpdate={game.updateSettings}
        onSaveCustom={game.saveCustomRoutine}
        onDeleteCustom={game.deleteCustomRoutine}
      />
    )
  }

  if (game.state.phase === 'routineResults' && game.routineResult) {
    if (game.launch.kind !== 'quick') {
      const level = game.launch.id ? getBalanceLevel(game.launch.id) : null
      const nextLevel = level ? BALANCE_LEVELS[level.number] ?? null : null
      return (
        <BalanceLevelResults
          launch={game.launch}
          level={level}
          result={game.routineResult}
          earnedStars={game.levelAward?.earnedStars ?? 0}
          previousStars={game.levelAward?.previousStars ?? 0}
          newTrophyIds={game.newTrophyIds}
          streak={balanceCurrentStreak(game.data.daily)}
          nextLevel={nextLevel}
          hapticFeedback={hapticFeedback}
          onReplay={() => game.start()}
          onNextLevel={() => nextLevel && startLevel(nextLevel)}
          onTrail={() => goTo('trail')}
          onHome={() => goTo('home')}
        />
      )
    }
    return (
      <BalanceResults
        result={game.routineResult}
        newTrophyIds={game.newTrophyIds}
        bestBalancedMs={Math.max(game.state.bestBalancedMs, game.data.routineSummaries[0]?.noteResults.reduce((best, note) => Math.max(best, note.balancedMs), 0) ?? 0)}
        hapticFeedback={hapticFeedback}
        onReplay={() => game.start()}
        onSetup={() => goTo('quick')}
        onGames={onBack}
      />
    )
  }

  const staffClef = getBalanceInstrument(game.state.settings.instrumentId).clef

  /** What the run is, for the bars and cards shown while it is in progress. */
  const runTitle =
    game.launch.kind === 'level'
      ? `Level ${getBalanceLevel(game.launch.id ?? '')?.number ?? ''} · ${game.launch.title}`
      : game.launch.kind === 'daily'
        ? game.launch.title
        : 'Balance'

  /*
   * Pause / stopped / error share one card. `game.reset` returns to the setup
   * phase, and `route` is still whichever screen launched the run, so "Quit"
   * lands the player back on the trail or on Quick Play without extra
   * bookkeeping.
   */
  if (game.state.phase === 'paused' || game.state.phase === 'stopped' || game.state.phase === 'error') {
    const paused = game.state.phase === 'paused'
    const errored = game.state.phase === 'error'
    return (
      <BalanceArcadeShell
        title={runTitle}
        hapticFeedback={hapticFeedback}
        onBack={game.reset}
        backLabel="Quit run"
        className="balance-arcade--state"
      >
        <div className="balance-arcade__spacer" />
        <section className="balance-card balance-award">
          <span className="balance-pill">{paused ? 'Paused' : errored ? 'Problem' : 'Stopped'}</span>
          <h1 className="balance-award__verdict">
            {paused ? 'Take a breath' : errored ? 'Unable to start' : 'Run stopped'}
          </h1>
          <p className="balance-card__line" style={{ margin: 0 }}>
            {paused
              ? 'The microphone and the rope are both on hold.'
              : errored
                ? game.state.errorMessage ?? 'The game could not continue.'
                : 'Nothing more was scored on this run.'}
          </p>
          <div className="balance-award__actions">
            {paused && (
              <Pressable haptic="medium" hapticFeedback={hapticFeedback} className="balance-cta" onClick={game.resume}>
                <Play aria-hidden /> Resume
              </Pressable>
            )}
            <Pressable
              intensity="soft"
              hapticFeedback={hapticFeedback}
              className={`balance-cta balance-cta--blue ${paused ? 'balance-cta--small' : ''}`}
              onClick={game.reset}
            >
              Quit run
            </Pressable>
          </div>
        </section>
        <div className="balance-arcade__spacer" />
      </BalanceArcadeShell>
    )
  }

  const target = game.currentTarget

  const cents = Math.round(game.hud.cents)
  const indicatorPosition = Math.max(0, Math.min(100, 50 + (game.hud.cents / Math.max(20, game.toleranceCents * 1.8)) * 50))
  const detectedTargetCents =
    target && readout.noteName !== '—'
      ? Math.round(centsFromConcertTarget(readout.midi, readout.cents, target.concertMidi))
      : null
  const micStatus =
    game.state.phase === 'countIn'
      ? 'Reference/count-in · scoring starts afterward'
      : sourceHealth === 'connecting'
        ? 'Connecting microphone…'
        : sourceHealth === 'stalled'
          ? 'Microphone unavailable'
          : detectedTargetCents !== null
            ? `Hearing ${readout.noteName} · ${detectedTargetCents >= 0 ? '+' : ''}${detectedTargetCents}¢ from target`
            : `Mic ready · play ${target?.concertLabel ?? 'the target'}`
  if (game.state.phase === 'noteResults' && game.state.currentResult) {
    const result = game.state.currentResult
    return (
      <div className="balance-state-screen">
        <section className="balance-state-card balance-note-result-card">
          <p className="balance-eyebrow">Written {result.target.writtenLabel} · Concert {result.target.concertLabel}</p>
          <h1>{result.goalReached ? 'Attempt complete' : 'Note released'}</h1>
          <p>{result.goalReached ? 'The measured goal was reached.' : 'The duration goal was not reached.'}</p>
          <dl>
            <div><dt>Balanced time</dt><dd>{formatBalanceDuration(result.balancedMs)}</dd></div>
            <div><dt>Total confident pitch</dt><dd>{formatBalanceDuration(result.totalConfidentMs)}</dd></div>
            <div><dt>Centered</dt><dd>{Math.round(result.centeredPercent)}%</dd></div>
            <div><dt>Average deviation</dt><dd>{result.signedAverageCents >= 0 ? '+' : ''}{Math.round(result.signedAverageCents)}¢</dd></div>
          </dl>
          {!result.goalReached && (
            <div className="balance-state-actions">
              <Pressable haptic="medium" hapticFeedback={hapticFeedback} className="balance-primary-button" onClick={game.retryNote}><RotateCcw /> Retry</Pressable>
              <Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={game.continueAfterNote}>Continue</Pressable>
              <Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={game.stop}>Stop</Pressable>
            </div>
          )}
        </section>
      </div>
    )
  }

  if (game.state.phase === 'resting') {
    const remaining = game.state.restEndsAt === null ? null : Math.max(0, game.state.restEndsAt - Date.now())
    const nextTarget = game.state.targets[game.state.targetIndex + 1] ?? null
    return (
      <div className="balance-play-screen balance-play-screen--rest">
        <BalanceScene
          phase="resting"
          target={nextTarget}
          visualRef={game.visualRef}
          characterId={game.state.settings.characterId}
          toleranceCents={game.toleranceCents}
          goalSeconds={game.state.settings.goalSeconds}
        />
        <section className="balance-rest-card">
          <p className="balance-eyebrow">Rest</p>
          <strong>{remaining === null ? 'Take your time' : `${Math.ceil(remaining / 1000)}s`}</strong>
          <p>Next: Written {nextTarget?.writtenLabel ?? '—'} · Concert {nextTarget?.concertLabel ?? '—'}</p>
          <Pressable hapticFeedback={hapticFeedback} onClick={game.skipRest}>Skip Rest</Pressable>
        </section>
      </div>
    )
  }

  const pitchIsVisible = game.hud.pitchPresent && detectedTargetCents !== null
  const pitchFeedback =
    game.state.phase === 'countIn'
      ? 'Get ready'
      : sourceHealth === 'connecting'
        ? 'Connecting microphone…'
        : sourceHealth === 'stalled'
          ? 'Microphone unavailable'
          : !pitchIsVisible
            ? `Play ${target?.writtenLabel ?? 'the note'} and hold it`
            : Math.abs(cents) >= 50
              // Beyond a semitone the cents number is useless and actively
              // misleading — a trumpeter set to concert pitch was being told to
              // lip down 200¢. Name what was actually heard instead.
              ? `Heard ${readout.noteName} — play ${target?.writtenLabel ?? 'the target'}`
              : `${cents >= 0 ? '+' : ''}${cents}¢ · ${Math.abs(cents) <= game.toleranceCents ? 'In tune' : cents < 0 ? 'Flat' : 'Sharp'}`
  const pitchFeedbackTone =
    sourceHealth === 'stalled'
      ? 'error'
      : !pitchIsVisible || Math.abs(cents) >= 50
        ? 'idle'
        : Math.abs(cents) <= game.toleranceCents
          ? 'centered'
          : cents < 0
            ? 'flat'
            : 'sharp'

  return (
    <div
      className={`balance-play-screen ${GAME_TEST_INPUT ? 'balance-play-screen--test-input' : ''}`}
      {...(GAME_TEST_INPUT
        ? {
            onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
              if ((event.target as HTMLElement).closest('button')) return
              startTestHold()
            },
            onPointerUp: stopTestHold,
            onPointerCancel: stopTestHold,
            onPointerLeave: stopTestHold,
          }
        : {})}
    >
      <header className="balance-play-header">
        <div className="balance-target-card">
          <small>{game.launch.kind === 'quick' ? 'Target' : runTitle}</small>
          <strong>{target?.writtenLabel ?? '—'}</strong>
          {/* The note as it is printed, under the name it is called. */}
          {target ? (
            <BalanceStaffNote
              writtenMidi={target.writtenMidi}
              clef={staffClef}
              height={62}
              className="balance-target-card__staff"
            />
          ) : null}
          <span>
            {game.state.targets.length > 1
              ? `Note ${game.state.targetIndex + 1} of ${game.state.targets.length}`
              : `Concert ${target?.concertLabel ?? '—'}`}
          </span>
        </div>
        <Pressable
          intensity="icon"
          hapticFeedback={hapticFeedback}
          className="balance-pause-button"
          onClick={game.pause}
          aria-label="Pause"
        ><Pause /></Pressable>
      </header>

      <BalanceScene
        phase={game.state.phase}
        target={target}
        visualRef={game.visualRef}
        characterId={game.state.settings.characterId}
        toleranceCents={game.toleranceCents}
        goalSeconds={game.state.settings.goalSeconds}
      />

      <section className="balance-game-hud" aria-label="Live balance status">
        <p className="balance-hud__time">Balanced <strong>{formatBalanceDuration(game.hud.balancedMs)}</strong></p>
        <div
          className="balance-pitch-strip"
          aria-label={pitchIsVisible ? `Pitch position ${cents} cents` : micStatus}
        >
          <span>FLAT</span>
          <div className="balance-pitch-strip__track" aria-hidden>
            <i className="balance-pitch-strip__zone" />
            <b className={pitchIsVisible ? 'is-visible' : ''} style={{ left: `${indicatorPosition}%` }} />
          </div>
          <span>SHARP</span>
        </div>
        <p className={`balance-pitch-feedback balance-pitch-feedback--${pitchFeedbackTone}`} aria-live="polite">{pitchFeedback}</p>
        <div className="balance-progress" aria-label={`${Math.round(game.hud.progress * 100)} percent complete`}><i style={{ width: `${game.hud.progress * 100}%` }} /></div>
      </section>
      {GAME_TEST_INPUT ? (
        <span className="balance-test-input-badge" aria-hidden>hold anywhere = play the note</span>
      ) : null}
    </div>
  )
}
