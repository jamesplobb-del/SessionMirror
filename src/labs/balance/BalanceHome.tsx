import { useMemo } from 'react'
import { ChevronRight, CircleCheck, Flame, Map, Play, Trophy } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from './BalanceArcadeShell'
import { getBalanceCharacter, type BalanceCharacterId } from './balanceCharacters'
import {
  balanceCurrentStreak,
  balanceDailyChallenge,
  balanceDailyIsComplete,
  balanceDayKey,
} from './balanceDaily'
import {
  balanceNextLevel,
  balanceTotalStars,
  BALANCE_MAX_STARS,
} from './balanceLevels'
import { getBalanceInstrument } from './balanceInstruments'
import { midiToBalanceNoteName } from './balanceMusic'
import { formatBalanceDuration } from './balanceStorage'
import type { BalanceDailyProgress, BalanceLevelProgress } from './balanceTypes'
import { BALANCE_TROPHIES } from './balanceTrophies'

interface BalanceHomeProps {
  instrumentId: string
  characterId: BalanceCharacterId
  levels: Record<string, BalanceLevelProgress>
  daily: BalanceDailyProgress
  trophyCount: number
  bestBalancedMs: number
  hapticFeedback: boolean
  onBack: () => void
  onStartDaily: () => void
  onQuickPlay: () => void
  onTrail: () => void
  onTrophies: () => void
  onInstrument: () => void
}

/**
 * The landing screen: today's challenge, the streak it feeds, and the two ways
 * further in. A player who opens the game with two minutes to spare should be
 * able to press one button and be playing.
 */
export default function BalanceHome({
  instrumentId,
  characterId,
  levels,
  daily,
  trophyCount,
  bestBalancedMs,
  hapticFeedback,
  onBack,
  onStartDaily,
  onQuickPlay,
  onTrail,
  onTrophies,
  onInstrument,
}: BalanceHomeProps) {
  const dayKey = balanceDayKey()
  const challenge = useMemo(
    () => balanceDailyChallenge(instrumentId, dayKey),
    [dayKey, instrumentId],
  )
  const streak = balanceCurrentStreak(daily, dayKey)
  const doneToday = balanceDailyIsComplete(daily, dayKey)
  const nextLevel = balanceNextLevel(levels)
  const totalStars = balanceTotalStars(levels)
  const character = getBalanceCharacter(characterId)
  const instrument = getBalanceInstrument(instrumentId)

  // Three flames, filled up to the streak — a full row reads as "on a roll"
  // without having to print a number the player has to parse.
  const flames = [0, 1, 2].map((index) => index < Math.min(3, streak))

  return (
    <BalanceArcadeShell
      title="Balance"
      hapticFeedback={hapticFeedback}
      onBack={onBack}
      backLabel="Back to Practice Games"
      stat={bestBalancedMs > 0 ? { label: 'Best', value: formatBalanceDuration(bestBalancedMs) } : null}
      className="balance-arcade--home"
    >
      <h1 className="balance-display balance-display--page">Today&apos;s Challenge</h1>

      {/*
        * The instrument sits above everything, because it decides every note
        * the game will ask for. Buried in Quick Play's options it was a
        * setting; here it reads as the first thing you tell the game.
        */}
      <Pressable
        intensity="soft"
        hapticFeedback={hapticFeedback}
        className="balance-instrument-pill"
        onClick={onInstrument}
      >
        <span>
          <small>Instrument</small>
          <strong>{instrument.name}</strong>
        </span>
        <b>
          {midiToBalanceNoteName(instrument.minWrittenMidi)}–
          {midiToBalanceNoteName(instrument.maxWrittenMidi)}
        </b>
        <ChevronRight aria-hidden />
      </Pressable>

      <div className="balance-home__portrait">
        {character.asset ? (
          <img src={character.asset} alt="" draggable={false} />
        ) : (
          <span className="balance-display balance-display--page" aria-hidden>♪</span>
        )}
        <b aria-hidden /><b aria-hidden /><b aria-hidden />
      </div>

      <section className="balance-card balance-home__challenge">
        <h2 className="balance-card__title">{challenge.name}</h2>
        <p className="balance-card__line">{challenge.objective}</p>

        {doneToday ? (
          <p className="balance-home__done">
            <CircleCheck aria-hidden /> Done today — come back tomorrow
          </p>
        ) : (
          <Pressable
            haptic="medium"
            hapticFeedback={hapticFeedback}
            className="balance-cta"
            onClick={onStartDaily}
          >
            <Play aria-hidden /> Start Challenge
          </Pressable>
        )}

        <Pressable
          intensity="soft"
          hapticFeedback={hapticFeedback}
          className="balance-textlink"
          onClick={onQuickPlay}
        >
          Quick Play
        </Pressable>
      </section>

      <p className={`balance-streak ${streak === 0 ? 'is-cold' : ''}`}>
        <span className="balance-streak__flames" aria-hidden>
          {flames.map((lit, index) => (
            <span key={index} className={`balance-streak__flame ${lit ? '' : 'is-empty'}`}>
              <Flame />
            </span>
          ))}
        </span>
        <strong>
          {streak === 0
            ? 'Start a streak'
            : `${streak} day streak`}
        </strong>
      </p>

      <div className="balance-home__nav">
        <Pressable
          intensity="soft"
          hapticFeedback={hapticFeedback}
          className="balance-tile"
          onClick={onTrail}
        >
          <span className="balance-tile__icon" aria-hidden><Map /></span>
          <strong>Sky Trail</strong>
          <small>Level {nextLevel.number} · {totalStars}/{BALANCE_MAX_STARS} ★</small>
        </Pressable>

        <Pressable
          intensity="soft"
          hapticFeedback={hapticFeedback}
          className="balance-tile balance-tile--gold"
          onClick={onTrophies}
        >
          <span className="balance-tile__icon" aria-hidden><Trophy /></span>
          <strong>Trophies</strong>
          <small>{trophyCount}/{BALANCE_TROPHIES.length} earned</small>
        </Pressable>
      </div>
    </BalanceArcadeShell>
  )
}
