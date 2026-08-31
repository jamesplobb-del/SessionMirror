import { ChevronRight, Flame, Map, RotateCcw, Trophy } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from './BalanceArcadeShell'
import BalanceStars from './BalanceStars'
import { getBalanceCharacter } from './balanceCharacters'
import { getBalanceTrophy } from './balanceTrophies'
import { formatBalanceDuration } from './balanceStorage'
import type { BalanceLaunch, BalanceRoutineResult, BalanceTrophyId } from './balanceTypes'
import type { BalanceLevel } from './balanceLevels'

interface BalanceLevelResultsProps {
  launch: BalanceLaunch
  level: BalanceLevel | null
  result: BalanceRoutineResult
  earnedStars: number
  previousStars: number
  newTrophyIds: BalanceTrophyId[]
  streak: number
  nextLevel: BalanceLevel | null
  hapticFeedback: boolean
  onReplay: () => void
  onNextLevel: () => void
  onTrail: () => void
  onHome: () => void
}

/**
 * The award screen for a level or the daily challenge.
 *
 * Star count is the headline because it is what the trail remembers; the three
 * numbers under it are the ones a player can actually act on next time —
 * whether they finished, how much of the sound was in the window, and how long
 * they held it in total.
 */
export default function BalanceLevelResults({
  launch,
  level,
  result,
  earnedStars,
  previousStars,
  newTrophyIds,
  streak,
  nextLevel,
  hapticFeedback,
  onReplay,
  onNextLevel,
  onTrail,
  onHome,
}: BalanceLevelResultsProps) {
  const isDaily = launch.kind === 'daily'
  const cleared = result.completed
  const beatBest = earnedStars > previousStars

  const verdict = isDaily
    ? cleared ? 'Challenge complete' : 'Not this time'
    : cleared
      ? earnedStars === 3 ? 'Perfect crossing' : 'Level cleared'
      : 'Level failed'

  const nextThreshold = level
    ? earnedStars >= 3
      ? null
      : earnedStars === 2
        ? level.threeStarPercent
        : level.twoStarPercent
    : null

  return (
    <BalanceArcadeShell
      title={isDaily ? "Today's Challenge" : `Level ${level?.number ?? ''}`}
      hapticFeedback={hapticFeedback}
      onBack={onHome}
      backLabel="Back to Balance home"
      className="balance-arcade--award"
    >
      <div className="balance-arcade__spacer" />

      <section className="balance-card balance-award">
        <span className="balance-pill">{isDaily ? launch.title : level?.name ?? 'Balance'}</span>

        {isDaily ? (
          <span className="balance-award__stars" aria-hidden>
            <span className="balance-streak__flame" style={{ width: '3.2rem', height: '3.2rem' }}>
              <Flame style={{ width: '1.9rem', height: '1.9rem' }} />
            </span>
          </span>
        ) : (
          <BalanceStars earned={earnedStars} className="balance-award__stars" />
        )}

        <h1 className="balance-award__verdict">{verdict}</h1>

        {isDaily && cleared ? (
          <p className="balance-card__line" style={{ margin: 0 }}>
            {streak === 1 ? 'Streak started' : `${streak} day streak`}
          </p>
        ) : beatBest && previousStars > 0 ? (
          <p className="balance-card__line" style={{ margin: 0 }}>
            New best — up from {previousStars} star{previousStars === 1 ? '' : 's'}
          </p>
        ) : nextThreshold !== null && cleared ? (
          <p className="balance-card__line" style={{ margin: 0 }}>
            {nextThreshold}% centered earns the next star
          </p>
        ) : !cleared ? (
          <p className="balance-card__line" style={{ margin: 0 }}>
            {result.notesCompleted} of {result.noteResults.length || 1} notes held to the goal
          </p>
        ) : null}

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
            <header><Trophy aria-hidden /> {newTrophyIds.length === 1 ? 'New trophy' : 'New trophies'}</header>
            {newTrophyIds.map((id) => {
              const trophy = getBalanceTrophy(id)
              const reward = trophy.characterReward
                ? getBalanceCharacter(trophy.characterReward).name
                : null
              return (
                <div key={id}>
                  <strong>{trophy.title}</strong>
                  <small>{reward ? `${trophy.description} · ${reward} unlocked` : trophy.description}</small>
                </div>
              )
            })}
          </section>
        )}

        <div className="balance-award__actions">
          {cleared && !isDaily && nextLevel ? (
            <>
              <Pressable
                haptic="medium"
                hapticFeedback={hapticFeedback}
                className="balance-cta"
                onClick={onNextLevel}
              >
                Next level <ChevronRight aria-hidden />
              </Pressable>
              <div className="balance-award__next">
                <Pressable
                  intensity="soft"
                  hapticFeedback={hapticFeedback}
                  className="balance-cta balance-cta--blue balance-cta--small"
                  onClick={onReplay}
                >
                  <RotateCcw aria-hidden /> Retry
                </Pressable>
                <Pressable
                  intensity="soft"
                  hapticFeedback={hapticFeedback}
                  className="balance-cta balance-cta--blue balance-cta--small"
                  onClick={onTrail}
                >
                  <Map aria-hidden /> Trail
                </Pressable>
              </div>
            </>
          ) : (
            <>
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
                onClick={isDaily ? onHome : onTrail}
              >
                {isDaily ? 'Home' : <><Map aria-hidden /> Back to trail</>}
              </Pressable>
            </>
          )}
        </div>
      </section>

      <div className="balance-arcade__spacer" />
    </BalanceArcadeShell>
  )
}
