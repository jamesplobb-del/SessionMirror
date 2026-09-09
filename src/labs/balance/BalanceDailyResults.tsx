import { Flame, RotateCcw, Trophy } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from './BalanceArcadeShell'
import { getBalanceCharacter } from './balanceCharacters'
import { getBalanceTrophy } from './balanceTrophies'
import { formatBalanceDuration } from './balanceStorage'
import type { BalanceLaunch, BalanceRoutineResult, BalanceTrophyId } from './balanceTypes'

interface BalanceDailyResultsProps {
  launch: BalanceLaunch
  result: BalanceRoutineResult
  newTrophyIds: BalanceTrophyId[]
  streak: number
  hapticFeedback: boolean
  onReplay: () => void
  onHome: () => void
}

/**
 * The award screen for the day's challenge.
 *
 * The streak is the headline, because with the Sky Trail gone it is the only
 * thing a run adds to besides the trophy case. The three numbers under it are
 * the ones a player can act on next time — whether they finished, how much of
 * the sound sat inside the window, and how long they held it in total.
 */
export default function BalanceDailyResults({
  launch,
  result,
  newTrophyIds,
  streak,
  hapticFeedback,
  onReplay,
  onHome,
}: BalanceDailyResultsProps) {
  const cleared = result.completed

  return (
    <BalanceArcadeShell
      title="Today's Challenge"
      hapticFeedback={hapticFeedback}
      onBack={onHome}
      backLabel="Back to Balance home"
      className="balance-arcade--award"
    >
      <div className="balance-arcade__spacer" />

      <section className="balance-card balance-award">
        <span className="balance-pill">{launch.title}</span>

        <span className="balance-award__stars" aria-hidden>
          <span className="balance-streak__flame" style={{ width: '3.2rem', height: '3.2rem' }}>
            <Flame style={{ width: '1.9rem', height: '1.9rem' }} />
          </span>
        </span>

        <h1 className="balance-award__verdict">
          {cleared ? 'Challenge complete' : 'Not this time'}
        </h1>

        <p className="balance-card__line" style={{ margin: 0 }}>
          {cleared
            ? streak === 1
              ? 'Streak started'
              : `${streak} day streak`
            : `${result.notesCompleted} of ${result.noteResults.length || 1} notes held to the goal`}
        </p>

        <dl className="balance-award__stats">
          <div>
            <dt>Notes</dt>
            <dd>{result.notesCompleted}/{result.noteResults.length}</dd>
          </div>
          <div>
            <dt>Centered</dt>
            <dd>{Math.round(result.centeredPercent)}%</dd>
          </div>
          <div>
            <dt>Balanced</dt>
            <dd>{formatBalanceDuration(result.totalBalancedMs)}</dd>
          </div>
        </dl>

        {newTrophyIds.length > 0 && (
          <section className="balance-award__unlocks" aria-live="polite">
            <header>
              <Trophy aria-hidden /> {newTrophyIds.length === 1 ? 'New trophy' : 'New trophies'}
            </header>
            {newTrophyIds.map((id) => {
              const trophy = getBalanceTrophy(id)
              const reward = trophy.characterReward
                ? getBalanceCharacter(trophy.characterReward).name
                : null
              return (
                <div key={id}>
                  <strong>{trophy.title}</strong>
                  <small>
                    {reward ? `${trophy.description} · ${reward} unlocked` : trophy.description}
                  </small>
                </div>
              )
            })}
          </section>
        )}

        <div className="balance-award__actions">
          <Pressable
            haptic="medium"
            hapticFeedback={hapticFeedback}
            className="balance-cta"
            onClick={onReplay}
          >
            <RotateCcw aria-hidden /> {cleared ? 'Play again' : 'Try again'}
          </Pressable>
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            className="balance-cta balance-cta--blue balance-cta--small"
            onClick={onHome}
          >
            Home
          </Pressable>
        </div>
      </section>

      <div className="balance-arcade__spacer" />
    </BalanceArcadeShell>
  )
}
