import { useMemo, useState } from 'react'
import { Check, ChevronRight, Trophy } from 'lucide-react'
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
import HallDoorWorld from './HallDoorWorlds'

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
  }> = [
    {
      id: 'staff-jumper',
      title: 'Staff Jumper',
      line: staffJumperBest ? `Best ${staffJumperBest}` : 'Sight reading',
      world: 'staff',
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
    },
    {
      id: 'learn-instrument',
      title: 'Learn',
      line: `${LEARN_INSTRUMENT_COUNT} instruments`,
      world: 'learn',
    },
  ]

  return (
    <BalanceArcadeShell
      title="Play"
      hapticFeedback={hapticFeedback}
      onBack={onBack}
      backLabel="Close Games"
      stat={streak > 0 ? { label: 'Streak', value: `${streak} day` } : null}
      className="balance-arcade--plaza balance-arcade--hall"
      scrollBody={false}
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

      <div className="balance-hall">
        <div className="balance-hall__doors" role="navigation" aria-label="Games">
          {doors.map((door) => {
            const current = lastGame === door.id
            return (
              <Pressable
                key={door.id}
                type="button"
                intensity="soft"
                squish={false}
                haptic="medium"
                hapticFeedback={hapticFeedback}
                className={`balance-door balance-door--${door.world} ${current ? 'is-open' : ''}`}
                aria-current={current ? 'true' : undefined}
                aria-label={`${current ? 'Continue in' : 'Enter'} ${door.title}. ${door.line}`}
                onClick={() => openGame(door.id, openers)}
              >
                <span className={`balance-door__world balance-door__world--${door.world}`} aria-hidden>
                  <HallDoorWorld world={door.world} characterSrc={character.asset} />
                </span>
                <span className="balance-door__plaque">
                  {current ? <em>Continue</em> : null}
                  <strong>{door.title}</strong>
                  <small>
                    {door.line.startsWith('Best ') ? <Trophy aria-hidden /> : null}
                    {door.line}
                  </small>
                </span>
              </Pressable>
            )
          })}
        </div>

        <div className="balance-hall__threshold">
          <div className="balance-hall__floor" aria-hidden />
          <Pressable
            intensity="soft"
            hapticFeedback={hapticFeedback}
            className={`balance-hall__player is-${lastGame === 'staff-jumper' ? 'staff' : lastGame === 'learn-instrument' ? 'learn' : 'balance'}`}
            onClick={() => setPage('character')}
            aria-label={`Character ${character.name}, waiting at the door. Change player`}
          >
            <span className="balance-hall__player-art" aria-hidden>
              <img
                src={character.asset}
                alt=""
                draggable={false}
                style={{ transform: `scale(${character.scale})` }}
              />
            </span>
          </Pressable>
        </div>
      </div>

      <p className="balance-hall__hint">
        Tap a door to go in · tap {character.name} to change player
      </p>
    </BalanceArcadeShell>
  )
}
