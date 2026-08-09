import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'
import { useLivePitchTracker, type PitchSourceHealth } from '../../hooks/useLivePitchTracker'
import Pressable from '../../components/ui/Pressable'
import BalanceResults from './BalanceResults'
import BalanceScene from './BalanceScene'
import BalanceSetup from './BalanceSetup'
import {
  buildBalanceTargets,
  inferBalanceInstrument,
} from './balanceMusic'
import { centsFromConcertTarget } from './balanceScoring'
import { formatBalanceDuration } from './balanceStorage'
import { balanceInstrumentSettings, useBalanceGame } from './useBalanceGame'
import './balance.css'

interface BalanceScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  tunerTransposition: TunerTranspositionId
  hapticFeedback: boolean
  micPermissionBlocked: boolean
  micPermissionPending: boolean
  onRequestMicStream: () => void
  onTunerSettingsChange: (settings: {
    tunerInstrument: TunerInstrument
    tunerTransposition: TunerTranspositionId
  }) => void
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
  onTunerSettingsChange,
  onBack,
}: BalanceScreenProps) {
  const initialInstrument = useMemo(
    () => inferBalanceInstrument(tunerTransposition, tunerInstrument),
    [tunerInstrument, tunerTransposition],
  )
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [sourceHealth, setSourceHealth] = useState<PitchSourceHealth>('idle')
  const game = useBalanceGame({
    initialInstrumentId: initialInstrument.id,
    hapticFeedback,
    onInstrumentChange: ({ instrumentId }) =>
      onTunerSettingsChange(balanceInstrumentSettings(instrumentId)),
  })
  const selectedInstrument = balanceInstrumentSettings(game.state.settings.instrumentId)
  const pitchEnabled =
    game.state.phase === 'setup' ||
    game.state.phase === 'countIn' ||
    game.state.phase === 'waitingForPitch' ||
    game.state.phase === 'pitchLock' ||
    game.state.phase === 'active'

  const { readout } = useLivePitchTracker(
    mediaRef,
    pitchEnabled,
    pitchEnabled,
    `balance-${streamGeneration}-${game.state.settings.instrumentId}`,
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

  const previewTargets = useMemo(
    () => buildBalanceTargets(game.state.settings, game.customRoutines),
    [game.customRoutines, game.state.settings],
  )

  if (game.state.phase === 'setup') {
    return (
      <BalanceSetup
        settings={game.state.settings}
        customRoutines={game.customRoutines}
        progression={game.data}
        previewTarget={previewTargets[0] ?? null}
        bestBalancedMs={game.state.bestBalancedMs}
        readout={readout}
        sourceHealth={sourceHealth}
        permissionBlocked={micPermissionBlocked}
        permissionPending={micPermissionPending}
        hapticFeedback={hapticFeedback}
        onBack={onBack}
        onStart={game.start}
        onRequestMic={onRequestMicStream}
        onUpdate={game.updateSettings}
        onSaveCustom={game.saveCustomRoutine}
        onDeleteCustom={game.deleteCustomRoutine}
      />
    )
  }

  if (game.state.phase === 'routineResults' && game.routineResult) {
    return (
      <BalanceResults
        result={game.routineResult}
        newTrophyIds={game.newTrophyIds}
        bestBalancedMs={Math.max(game.state.bestBalancedMs, game.data.routineSummaries[0]?.noteResults.reduce((best, note) => Math.max(best, note.balancedMs), 0) ?? 0)}
        hapticFeedback={hapticFeedback}
        onReplay={game.start}
        onSetup={game.reset}
        onGames={onBack}
      />
    )
  }

  if (game.state.phase === 'paused') {
    return (
      <div className="balance-state-screen">
        <section className="balance-state-card">
          <p className="balance-eyebrow">Balance</p><h1>Paused</h1>
          <p>The microphone and movement are paused.</p>
          <div className="balance-state-actions">
            <Pressable haptic="medium" hapticFeedback={hapticFeedback} className="balance-primary-button" onClick={game.resume}><Play /> Resume</Pressable>
            <Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={game.reset}>Settings</Pressable>
            <Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={onBack}>Games</Pressable>
          </div>
        </section>
      </div>
    )
  }

  if (game.state.phase === 'stopped') {
    return (
      <div className="balance-state-screen"><section className="balance-state-card">
        <p className="balance-eyebrow">Balance</p><h1>Run stopped</h1><p>No additional pitch was scored.</p>
        <div className="balance-state-actions"><Pressable hapticFeedback={hapticFeedback} className="balance-primary-button" onClick={game.reset}>Settings</Pressable><Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={onBack}>Games</Pressable></div>
      </section></div>
    )
  }

  if (game.state.phase === 'error') {
    return (
      <div className="balance-state-screen"><section className="balance-state-card">
        <p className="balance-eyebrow">Balance</p><h1>Unable to start</h1><p>{game.state.errorMessage ?? 'The game could not continue.'}</p>
        <div className="balance-state-actions"><Pressable hapticFeedback={hapticFeedback} className="balance-primary-button" onClick={game.reset}>Back to settings</Pressable><Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={onBack}>Games</Pressable></div>
      </section></div>
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
            ? 'Find the note'
            : `${cents >= 0 ? '+' : ''}${cents}¢ · ${Math.abs(cents) <= game.toleranceCents ? 'In tune' : cents < 0 ? 'Flat' : 'Sharp'}`
  const pitchFeedbackTone =
    sourceHealth === 'stalled'
      ? 'error'
      : !pitchIsVisible
        ? 'idle'
        : Math.abs(cents) <= game.toleranceCents
          ? 'centered'
          : cents < 0
            ? 'flat'
            : 'sharp'

  return (
    <div className="balance-play-screen">
      <header className="balance-play-header">
        <div className="balance-target-card">
          <small>Target</small>
          <strong>{target?.writtenLabel ?? '—'}</strong>
          <span>Concert {target?.concertLabel ?? '—'}</span>
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
    </div>
  )
}
