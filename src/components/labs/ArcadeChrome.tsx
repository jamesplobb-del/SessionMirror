import type { ReactNode } from 'react'
import {
  ArrowLeft,
  ChevronRight,
} from 'lucide-react'
import type { PitchReadout } from '../../utils/pitchUtils'
import Pressable from '../ui/Pressable'

type ArcadeAccent = 'rush' | 'staff'

interface ArcadeGameHeaderProps {
  accent: ArcadeAccent
  title: string
  subtitle: string
  bestScore: number
  icon: ReactNode
  hapticFeedback: boolean
  onBack: () => void
}

export function ArcadeGameHeader({
  accent,
  title,
  bestScore,
  hapticFeedback,
  onBack,
}: ArcadeGameHeaderProps) {
  return (
    <header className="arcade-game-header" data-accent={accent}>
      <Pressable
        type="button"
        intensity="icon"
        hapticFeedback={hapticFeedback}
        onClick={onBack}
        className="arcade-icon-button"
        aria-label="Back to Practice Arcade"
      >
        <ArrowLeft aria-hidden />
      </Pressable>

      <div className="arcade-game-header__identity">
        <span className="arcade-game-header__title">{title}</span>
      </div>

      <div className="arcade-best-chip" aria-label={`Personal best ${bestScore}`}>
        <span>Best {bestScore || '—'}</span>
      </div>
    </header>
  )
}

interface ArcadeMicCheckProps {
  readout: PitchReadout
  profileLabel: string
  displayNote?: string
  detail?: string
}

export function ArcadeMicCheck({
  readout,
  profileLabel,
  displayNote,
  detail,
}: ArcadeMicCheckProps) {
  const hasSignal =
    Number.isFinite(readout.frequencyHz) &&
    readout.frequencyHz > 0 &&
    Boolean(readout.noteName && readout.noteName !== '—')
  const cents = Math.round(readout.cents)
  const centsLabel = cents === 0 ? 'Centered' : `${cents > 0 ? '+' : ''}${cents}¢`

  return (
    <section className={`arcade-mic-check ${hasSignal ? 'arcade-mic-check--live' : ''}`}>
      <span className="arcade-mic-check__status" aria-hidden />
      <div className="arcade-mic-check__copy">
        <p>{hasSignal ? 'Microphone ready' : 'Listening for your instrument'}</p>
        <span>{detail ?? `${profileLabel} profile`}</span>
      </div>
      <div className="arcade-mic-check__readout" aria-live="polite">
        <strong>{hasSignal ? displayNote ?? readout.noteName : '—'}</strong>
        <span>{hasSignal ? centsLabel : 'Play a note'}</span>
      </div>
    </section>
  )
}

interface ArcadePauseScreenProps {
  accent: ArcadeAccent
  title: string
  score: number
  streak: number
  icon: ReactNode
  hapticFeedback: boolean
  onResume: () => void
  onSetup: () => void
  onLabs: () => void
}

export function ArcadePauseScreen({
  accent,
  title,
  score,
  streak,
  hapticFeedback,
  onResume,
  onSetup,
  onLabs,
}: ArcadePauseScreenProps) {
  return (
    <div className="arcade-state-screen" data-accent={accent}>
      <div className="arcade-state-card arcade-state-card--pause">
        <h1>Paused</h1>
        <p className="arcade-state-lede">{title}</p>

        <div className="arcade-pause-stats">
          <div>
            <span>Score</span>
            <strong>{score}</strong>
          </div>
          <div>
            <span>Current streak</span>
            <strong>{streak}</strong>
          </div>
        </div>

        <div className="arcade-state-actions">
          <Pressable
            type="button"
            haptic="medium"
            hapticFeedback={hapticFeedback}
            onClick={onResume}
            className="arcade-primary-button"
          >
            Resume
            <ChevronRight aria-hidden />
          </Pressable>
          <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onSetup} className="arcade-secondary-button">
            Settings
          </Pressable>
          <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onLabs} className="arcade-text-button">
            Games
          </Pressable>
        </div>
      </div>
    </div>
  )
}

interface ArcadeResultsProps {
  accent: ArcadeAccent
  gameTitle: string
  runLabel: string
  score: number
  bestScore: number
  bestStreak: number
  accuracy: number
  correctCount: number
  missCount: number
  durationSeconds: number
  hapticFeedback: boolean
  onReplay: () => void
  onSetup: () => void
  onLabs: () => void
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function ArcadeResults({
  accent,
  gameTitle,
  runLabel,
  score,
  bestScore,
  bestStreak,
  accuracy,
  correctCount,
  missCount,
  durationSeconds,
  hapticFeedback,
  onReplay,
  onSetup,
  onLabs,
}: ArcadeResultsProps) {
  const isPersonalBest = score > 0 && score >= bestScore

  return (
    <div className="arcade-state-screen" data-accent={accent}>
      <div className="arcade-state-card arcade-state-card--results">
        <div className="arcade-results-topline">
          <span className="arcade-state-eyebrow">{gameTitle}</span>
          {isPersonalBest && (
            <span className="arcade-new-best">Personal best</span>
          )}
        </div>
        <h1>Run complete</h1>

        <section className="arcade-score-hero" aria-label={`Final score ${score}`}>
          <span>{gameTitle}</span>
          <strong>{score}</strong>
          <small>{runLabel}</small>
        </section>

        <dl className="arcade-results-grid">
          <div>
            <dt>Accuracy</dt>
            <dd>{accuracy}%</dd>
          </div>
          <div>
            <dt>Best streak</dt>
            <dd>{bestStreak}</dd>
          </div>
          <div>
            <dt>Notes landed</dt>
            <dd>{correctCount}</dd>
          </div>
          <div>
            <dt>Run time</dt>
            <dd>{formatDuration(durationSeconds)}</dd>
          </div>
        </dl>

        <div className="arcade-result-detail">
          <span>{missCount === 0 ? 'Clean run · no hearts lost' : `${missCount} ${missCount === 1 ? 'miss' : 'misses'} this run`}</span>
          <span>Best {bestScore}</span>
        </div>

        <div className="arcade-state-actions">
          <Pressable
            type="button"
            haptic="medium"
            hapticFeedback={hapticFeedback}
            onClick={onReplay}
            className="arcade-primary-button"
          >
            Play again
          </Pressable>
          <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onSetup} className="arcade-secondary-button">
            Settings
          </Pressable>
          <Pressable type="button" intensity="soft" hapticFeedback={hapticFeedback} onClick={onLabs} className="arcade-text-button">
            Games
          </Pressable>
        </div>
      </div>
    </div>
  )
}
