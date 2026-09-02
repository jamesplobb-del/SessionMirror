import { useMemo, useState } from 'react'
import { Check, ChevronRight, Music4, Play, Trophy, Wind } from 'lucide-react'
import balanceShot from '../../assets/games/balance.jpg'
import learnInstrumentShot from '../../assets/games/learn-instrument.jpg'
import staffJumperShot from '../../assets/games/staff-jumper.jpg'
import Pressable from '../ui/Pressable'
import BalanceArcadeShell from '../../labs/balance/BalanceArcadeShell'
import BalanceInstrumentPicker from '../../labs/balance/BalanceInstrumentPicker'
import '../../labs/balance/balance-arcade.css'
import { inferBalanceInstrument, getBalanceInstrument } from '../../labs/balance/balanceInstruments'
import { midiToBalanceNoteName } from '../../labs/balance/balanceMusic'
import {
  balanceCurrentStreak,
  balanceDailyChallenge,
  balanceDailyIsComplete,
  balanceDayKey,
} from '../../labs/balance/balanceDaily'
import {
  formatBalanceDuration,
  loadBalanceBestMs,
  loadBalanceData,
} from '../../labs/balance/balanceStorage'
import {
  getPracticeGameCharacter,
  loadPracticeGameCharacter,
  PRACTICE_GAME_CHARACTERS,
  savePracticeGameCharacter,
  type PracticeGameCharacterId,
} from '../../labs/practiceGameCharacters'
import {
  loadLastPracticeGame,
  loadPracticeGameInstrumentId,
  saveLastPracticeGame,
  savePracticeGameInstrumentId,
  type PracticeGameId,
} from '../../labs/practiceGameInstrument'
import { loadBestScore as loadStaffJumperBestScore } from '../../labs/staffJumper/staffJumperMusicLogic'
import { INSTRUMENTS as LEARN_INSTRUMENTS } from '../../labs/learnInstrument/instrumentData'
import type { TunerInstrument } from '../../utils/pitchConfig'
import type { TunerTranspositionId } from '../../utils/tunerTransposition'

type PlazaPage = 'plaza' | 'instrument' | 'character'

interface LabsMenuProps {
  hapticFeedback: boolean
  tunerInstrument: TunerInstrument
  tunerTransposition: TunerTranspositionId
  onOpenStaffJumper: () => void
  onOpenBalance: () => void
  onOpenLearnInstrument: () => void
  onBack: () => void
}

const LEARN_INSTRUMENT_COUNT = LEARN_INSTRUMENTS.length

function openGame(
  id: PracticeGameId,
  open: Record<PracticeGameId, () => void>,
): void {
  saveLastPracticeGame(id)
  open[id]()
}

export default function LabsMenu({
  hapticFeedback,
  tunerInstrument,
  tunerTransposition,
  onOpenStaffJumper,
  onOpenBalance,
  onOpenLearnInstrument,
  onBack,
}: LabsMenuProps) {
  const [page, setPage] = useState<PlazaPage>('plaza')
  const [characterId, setCharacterId] = useState<PracticeGameCharacterId>(loadPracticeGameCharacter)
  const [instrumentId, setInstrumentId] = useState(() => {
    const saved = loadPracticeGameInstrumentId()
    const id =
      saved ?? inferBalanceInstrument(tunerTransposition, tunerInstrument).id
    savePracticeGameInstrumentId(id)
    return id
  })
  const character = getPracticeGameCharacter(characterId)
  const instrument = getBalanceInstrument(instrumentId)
  const staffJumperBest = loadStaffJumperBestScore()
  const balanceBest = loadBalanceBestMs()
  const balanceData = loadBalanceData(instrumentId)
  const dayKey = balanceDayKey()
  const challenge = useMemo(
    () => balanceDailyChallenge(instrumentId, dayKey),
    [dayKey, instrumentId],
  )
  const streak = balanceCurrentStreak(balanceData.daily, dayKey)
  const dailyDone = balanceDailyIsComplete(balanceData.daily, dayKey)
  const lastGame = loadLastPracticeGame() ?? 'balance'
  const openers = {
    'staff-jumper': onOpenStaffJumper,
    balance: onOpenBalance,
    'learn-instrument': onOpenLearnInstrument,
  } as const

  const selectCharacter = (id: PracticeGameCharacterId) => {
    setCharacterId(id)
    savePracticeGameCharacter(id)
    setPage('plaza')
  }

  const selectInstrument = (id: string) => {
    const next = getBalanceInstrument(id)
    setInstrumentId(next.id)
    savePracticeGameInstrumentId(next.id)
    setPage('plaza')
  }

  if (page === 'instrument') {
    return (
      <BalanceInstrumentPicker
        instrumentId={instrumentId}
        hapticFeedback={hapticFeedback}
        onBack={() => setPage('plaza')}
        onSelect={selectInstrument}
        backLabel="Back to Play"
        lede="Games follow your horn's own range."
      />
    )
  }

  if (page === 'character') {
    return (
      <BalanceArcadeShell
        title="Character"
        hapticFeedback={hapticFeedback}
        onBack={() => setPage('plaza')}
        backLabel="Back to Play"
        className="balance-arcade--plaza"
      >
        <h1 className="balance-display balance-display--page">Your Player</h1>
        <p className="balance-subdisplay">Staff Jumper and Balance</p>
        <div className="balance-plaza__characters" role="radiogroup" aria-label="Game character">
          {PRACTICE_GAME_CHARACTERS.map((option) => {
            const selected = option.id === characterId
            return (
              <Pressable
                key={option.id}
                type="button"
                intensity="soft"
                hapticFeedback={hapticFeedback}
                className={`balance-plaza__character ${selected ? 'is-selected' : ''}`}
                role="radio"
                aria-checked={selected}
                aria-label={`Use ${option.name} in Staff Jumper and Balance`}
                onClick={() => selectCharacter(option.id)}
              >
                <span className="balance-plaza__character-art" aria-hidden>
                  <img
                    src={option.asset}
                    alt=""
                    draggable={false}
                    style={{ transform: `scale(${option.scale})` }}
                  />
                  {selected ? <Check /> : null}
                </span>
                <strong>{option.name}</strong>
              </Pressable>
            )
          })}
        </div>
      </BalanceArcadeShell>
    )
  }

  const doors: Array<{
    id: PracticeGameId
    title: string
    line: string
    world: 'staff' | 'balance' | 'learn'
    description: string
    image: string
  }> = [
    {
      id: 'staff-jumper',
      title: 'Staff Jumper',
      line: staffJumperBest ? `Best ${staffJumperBest}` : 'Sight reading',
      world: 'staff',
      description: 'Read the note under your player and hop across the staff.',
      image: staffJumperShot,
    },
    {
      id: 'balance',
      title: 'Balance',
      line: !dailyDone
        ? challenge.name
        : balanceBest > 0
          ? `Best ${formatBalanceDuration(balanceBest)}`
          : 'Hold your note',
      world: 'balance',
      description: 'Hold the shown pitch in tune to keep your player moving.',
      image: balanceShot,
    },
    {
      id: 'learn-instrument',
      title: 'Learn',
      line: `${LEARN_INSTRUMENT_COUNT} instruments`,
      world: 'learn',
      description: 'Match the written note and the real fingering chart, one note at a time.',
      image: learnInstrumentShot,
    },
  ]

  return (
    <BalanceArcadeShell
      title="Play"
      hapticFeedback={hapticFeedback}
      onBack={onBack}
      backLabel="Close Games"
      stat={streak > 0 ? { label: 'Streak', value: `${streak} day` } : null}
      className="balance-arcade--plaza balance-arcade--games"
    >
      <h1 className="sr-only">Practice Games</h1>

      <Pressable
        intensity="soft"
        hapticFeedback={hapticFeedback}
        className="balance-instrument-pill balance-instrument-pill--quiet"
        onClick={() => setPage('instrument')}
        aria-label={`Instrument ${instrument.name}. Change instrument`}
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

      <ul className="arcade-game-list balance-game-list" aria-label="Games">
        {doors.map((door) => {
          const current = lastGame === door.id
          const accentClass = door.world === 'learn' ? 'wind' : door.world
          return (
            <li key={door.id}>
              <Pressable
                type="button"
                intensity="normal"
                squish={false}
                haptic="medium"
                hapticFeedback={hapticFeedback}
                className={`arcade-game-card arcade-game-card--${accentClass} ${current ? 'is-current' : ''}`}
                aria-current={current ? 'true' : undefined}
                aria-label={`${current ? 'Continue' : 'Play'} ${door.title}. ${door.description}`}
                onClick={() => openGame(door.id, openers)}
              >
                <span className="arcade-game-card__copy">
                  <span className="arcade-game-card__badge">
                    {door.world === 'staff' ? <Music4 aria-hidden /> : door.world === 'learn' ? <Wind aria-hidden /> : null}
                    {current ? 'Continue' : door.line}
                  </span>
                  <h3>{door.title}</h3>
                  <p>{door.description}</p>
                  <span className="arcade-game-card__meta">
                    <span>
                      {door.line.startsWith('Best ') ? <Trophy aria-hidden /> : null}
                      {door.line}
                    </span>
                  </span>
                </span>
                <span className={`arcade-game-card__art arcade-game-card__art--${accentClass}`} aria-hidden>
                  <img className="arcade-game-card__shot" src={door.image} alt="" decoding="async" />
                  <span className="arcade-game-card__go"><Play aria-hidden /></span>
                </span>
              </Pressable>
            </li>
          )
        })}
      </ul>

      <Pressable
        intensity="soft"
        hapticFeedback={hapticFeedback}
        className="balance-games__character"
        onClick={() => setPage('character')}
        aria-label={`Character ${character.name}. Change player`}
      >
        <span aria-hidden>
          <img src={character.asset} alt="" draggable={false} />
        </span>
        <span><small>Player</small><strong>{character.name}</strong></span>
        <ChevronRight aria-hidden />
      </Pressable>
    </BalanceArcadeShell>
  )
}
