import { ArrowLeft, RotateCcw, Settings2, Trophy } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import { formatBalanceDuration } from './balanceStorage'
import { getBalanceTrophy } from './balanceTrophies'
import { getBalanceCharacter } from './balanceCharacters'
import type { BalanceRoutineResult, BalanceTrophyId } from './balanceTypes'

interface BalanceResultsProps {
  result: BalanceRoutineResult
  newTrophyIds: BalanceTrophyId[]
  bestBalancedMs: number
  hapticFeedback: boolean
  onReplay: () => void
  onSetup: () => void
  onGames: () => void
}

function rounded(value: number): string {
  const next = Math.round(value * 10) / 10
  return `${next >= 0 ? '+' : ''}${next.toFixed(1)}¢`
}

function roundedWhole(value: number): string {
  const next = Math.round(value)
  return `${next >= 0 ? '+' : ''}${next}¢`
}

export default function BalanceResults({
  result,
  newTrophyIds,
  bestBalancedMs,
  hapticFeedback,
  onReplay,
  onSetup,
  onGames,
}: BalanceResultsProps) {
  const ranked = [...result.noteResults].sort((a, b) => b.centeredPercent - a.centeredPercent)
  const mostStable = ranked[0]
  const leastStable = ranked.at(-1)
  return (
    <div className="balance-results-screen">
      <section className="balance-results-card">
        <p className="balance-eyebrow">Balance</p>
        <h1>Routine complete</h1>
        <p className="balance-results-card__routine">{result.routineName}</p>

        <div className="balance-score-hero">
          <span>Balanced time</span>
          <strong>{formatBalanceDuration(result.totalBalancedMs)}</strong>
          <small>Best single note {bestBalancedMs > 0 ? formatBalanceDuration(bestBalancedMs) : '—'}</small>
        </div>

        {newTrophyIds.length > 0 && (
          <section className="balance-new-trophies" aria-live="polite">
            <header><Trophy aria-hidden /><strong>{newTrophyIds.length === 1 ? 'New trophy earned' : 'New trophies earned'}</strong></header>
            {newTrophyIds.map((id) => {
              const trophy = getBalanceTrophy(id)
              const reward = trophy.characterReward
                ? getBalanceCharacter(trophy.characterReward).name
                : null
              return (
                <div key={id}>
                  <span><strong>{trophy.title}</strong><small>{trophy.description}</small></span>
                  {reward && <em>{reward} unlocked</em>}
                </div>
              )
            })}
          </section>
        )}

        <dl className="balance-results-grid">
          <div><dt>Notes completed</dt><dd>{result.notesCompleted}/{result.noteResults.length}</dd></div>
          <div><dt>Centered</dt><dd>{Math.round(result.centeredPercent)}%</dd></div>
          <div><dt>Confident pitch</dt><dd>{formatBalanceDuration(result.totalConfidentMs)}</dd></div>
          <div><dt>Routine</dt><dd>{result.completed ? 'Complete' : 'Incomplete'}</dd></div>
        </dl>

        {mostStable && leastStable && result.noteResults.length > 1 && (
          <div className="balance-stability-summary">
            <span>Highest centered %<strong>{mostStable.target.writtenLabel} · {Math.round(mostStable.centeredPercent)}%</strong></span>
            <span>Lowest centered %<strong>{leastStable.target.writtenLabel} · {Math.round(leastStable.centeredPercent)}%</strong></span>
          </div>
        )}

        <div className="balance-note-results-list">
          {result.noteResults.map((note, index) => (
            <article key={`${note.target.id}-${index}`}>
              <header><strong>{note.target.writtenLabel}</strong><span>{note.goalReached ? 'Goal reached' : 'Incomplete'}</span></header>
              <p>Concert {note.target.concertLabel} · tolerance ±{note.toleranceCents}¢</p>
              <dl>
                <div><dt>Balanced</dt><dd>{formatBalanceDuration(note.balancedMs)}</dd></div>
                <div><dt>Centered</dt><dd>{Math.round(note.centeredPercent)}%</dd></div>
                <div><dt>Longest centered</dt><dd>{formatBalanceDuration(note.longestCenteredMs)}</dd></div>
                <div><dt>Average deviation</dt><dd>{rounded(note.signedAverageCents)}</dd></div>
                <div><dt>Average absolute</dt><dd>{Math.abs(note.averageAbsoluteCents).toFixed(1)}¢</dd></div>
                <div><dt>Range</dt><dd>{roundedWhole(note.flattestCents)} to {roundedWhole(note.sharpestCents)}</dd></div>
              </dl>
              {note.driftDirection && <small>Measured drift: {note.driftDirection}</small>}
            </article>
          ))}
        </div>

        <div className="balance-results-actions">
          <Pressable haptic="medium" hapticFeedback={hapticFeedback} className="balance-primary-button" onClick={onReplay}><RotateCcw /> Play again</Pressable>
          <Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={onSetup}><Settings2 /> Settings</Pressable>
          <Pressable intensity="soft" hapticFeedback={hapticFeedback} onClick={onGames}><ArrowLeft /> Games</Pressable>
        </div>
      </section>
    </div>
  )
}
