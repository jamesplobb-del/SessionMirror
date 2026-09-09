import { useMemo } from 'react'
import { ChevronRight, CircleCheck, Flame, Play, Trophy } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import BalanceArcadeShell from './BalanceArcadeShell'
import { getBalanceCharacter, type BalanceCharacterId } from './balanceCharacters'
import {
  balanceCurrentStreak,
  balanceDailyChallenge,
  balanceDailyIsComplete,
  balanceDayKey,
} from './balanceDaily'
import { getBalanceInstrument } from './balanceInstruments'
import { midiToBalanceNoteName } from './balanceMusic'
import { formatBalanceDuration } from './balanceStorage'
import type { BalanceDailyProgress } from './balanceTypes'
import { BALANCE_TROPHIES } from './balanceTrophies'

interface BalanceHomeProps {
  instrumentId: string
  characterId: BalanceCharacterId
  daily: BalanceDailyProgress
  trophyCount: number
  bestBalancedMs: number
  hapticFeedback: boolean
  onBack: () => void
  onStartDaily: () => void
  onQuickPlay: () => void
  onTrophies: () => void
  onInstrument: () => void
}

/**
 * The landing screen.
 *
 * Quick Play is the game — one enormous button, already set up for the
 * instrument chosen when the app was first opened, so a player with two
 * minutes can press once and be playing. Today's challenge sits under it as
 * the reason to come back, and the streak and the trophy case are the whole of
 * the progression now that the Sky Trail is gone.
 */
export default function BalanceHome({
  instrumentId,
  characterId,
  daily,
  trophyCount,
  bestBalancedMs,
  hapticFeedback,
  onBack,
  onStartDaily,
  onQuickPlay,
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
      <h1 className="balance-display balance-display--page">Balance</h1>

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

      {/* Quick Play first and biggest: it is the game, and it is already set
        * up for the instrument above, so there is nothing to decide before
        * playing. The challenge is the reason to come back tomorrow, not the
        * thing standing between the player and a note. */}
      <section className="balance-card balance-home__challenge">
        <Pressable
          haptic="medium"
          hapticFeedback={hapticFeedback}
          className="balance-cta"
          onClick={onQuickPlay}
        >
          <Play aria-hidden /> Quick Play
        </Pressable>
        <p className="balance-card__line">Hold your note. Reach the flag.</p>
      </section>

      <section className="balance-card balance-home__challenge">
        <span className="balance-pill">Today&apos;s Challenge</span>
        <h2 className="balance-card__title">{challenge.name}</h2>
        <p className="balance-card__line">{challenge.objective}</p>

        {doneToday ? (
          <p className="balance-home__done">
            <CircleCheck aria-hidden /> Done today — come back tomorrow
          </p>
        ) : (
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            className="balance-cta balance-cta--blue balance-cta--small"
            onClick={onStartDaily}
          >
            Start Challenge
          </Pressable>
        )}
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

      <div className="balance-home__nav balance-home__nav--single">
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
