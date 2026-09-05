import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
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
type GameWorld = 'staff' | 'balance' | 'learn'

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
const WORLD_ORDER: GameWorld[] = ['staff', 'balance', 'learn']
const PLAYER_LEFT: Record<GameWorld, string> = {
  staff: '16.666%',
  balance: '50%',
  learn: '83.333%',
}
const HOP_MS = 440
const STEP_IN_MS = 280

function worldForGame(id: PracticeGameId): GameWorld {
  if (id === 'staff-jumper') return 'staff'
  if (id === 'learn-instrument') return 'learn'
  return 'balance'
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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
  const [atWorld, setAtWorld] = useState<GameWorld>(() => worldForGame(lastGame))
  const [facing, setFacing] = useState<'left' | 'right'>('right')
  const [walking, setWalking] = useState(false)
  const [steppingIn, setSteppingIn] = useState(false)
  const [hopKey, setHopKey] = useState(0)
  const pendingOpenRef = useRef<PracticeGameId | null>(null)
  const walkTimerRef = useRef(0)
  const openers = {
    'staff-jumper': onOpenStaffJumper,
    balance: onOpenBalance,
    'learn-instrument': onOpenLearnInstrument,
  } as const
  const range = `${midiToBalanceNoteName(instrument.minWrittenMidi)}–${midiToBalanceNoteName(instrument.maxWrittenMidi)}`

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

  useEffect(() => () => window.clearTimeout(walkTimerRef.current), [])

  const finishEnter = () => {
    window.clearTimeout(walkTimerRef.current)
    setWalking(false)
    setSteppingIn(false)
    const id = pendingOpenRef.current
    pendingOpenRef.current = null
    if (id) openGame(id, openers)
  }

  const beginStepIn = () => {
    window.clearTimeout(walkTimerRef.current)
    setWalking(false)
    setSteppingIn(true)
    walkTimerRef.current = window.setTimeout(finishEnter, STEP_IN_MS)
  }

  const hopToward = (path: GameWorld[]) => {
    const next = path[0]
    if (!next) {
      beginStepIn()
      return
    }
    setAtWorld(next)
    setHopKey((key) => key + 1)
    window.clearTimeout(walkTimerRef.current)
    walkTimerRef.current = window.setTimeout(() => hopToward(path.slice(1)), HOP_MS)
  }

  const walkInto = (id: PracticeGameId) => {
    if (prefersReducedMotion()) {
      openGame(id, openers)
      return
    }
    if (steppingIn) return
    const world = worldForGame(id)
    pendingOpenRef.current = id
    if (world === atWorld && !walking) {
      beginStepIn()
      return
    }
    const from = WORLD_ORDER.indexOf(atWorld)
    const to = WORLD_ORDER.indexOf(world)
    const step = to > from ? 1 : -1
    const path: GameWorld[] = []
    for (let index = from; index !== to; index += step) {
      path.push(WORLD_ORDER[index + step]!)
    }
    setFacing(step > 0 ? 'right' : 'left')
    setSteppingIn(false)
    setWalking(true)
    window.clearTimeout(walkTimerRef.current)
    hopToward(path)
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
                  <img src={option.asset} alt="" draggable={false} />
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
    world: GameWorld
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
      className="balance-arcade--plaza balance-arcade--hall"
    >
      <h1 className="sr-only">Practice Games</h1>

      <Pressable
        intensity="soft"
        hapticFeedback={hapticFeedback}
        className="balance-instrument-board"
        onClick={() => setPage('instrument')}
        aria-label={`Instrument ${instrument.name}. Change instrument`}
      >
        <span>
          <small>Playing on</small>
          <strong>{instrument.name}</strong>
          <b>Written {range}</b>
        </span>
        <em>Change</em>
        <ChevronRight aria-hidden />
      </Pressable>

      <div className="balance-hall">
        <div className="balance-hall__doors" role="list" aria-label="Games">
          {doors.map((door) => {
            const current = lastGame === door.id
            return (
              <Pressable
                key={door.id}
                type="button"
                intensity="normal"
                squish={false}
                haptic="medium"
                hapticFeedback={hapticFeedback}
                className={`balance-door ${atWorld === door.world ? 'is-open' : ''}`}
                aria-current={current ? 'true' : undefined}
                aria-label={`${current ? 'Continue' : 'Play'} ${door.title}. ${door.description}`}
                onClick={() => walkInto(door.id)}
              >
                <span className={`balance-door__world balance-door__world--${door.world}`} aria-hidden>
                  {current ? <em className="balance-door__continue">Continue</em> : null}
                  <img className="balance-door__preview" src={door.image} alt="" decoding="async" />
                </span>
                <span className="balance-door__name">
                  <strong>{door.title}</strong>
                  <small>{door.line}</small>
                </span>
              </Pressable>
            )
          })}
        </div>

        <div className="balance-hall__threshold">
          <div className="balance-hall__floor" aria-hidden />
          <div
            className={`balance-hall__player is-${atWorld} ${
              steppingIn ? 'is-stepping-in' : walking ? 'is-walking' : 'is-idle'
            } is-face-${facing}`}
            style={{ left: PLAYER_LEFT[atWorld] }}
          >
            <Pressable
              intensity="soft"
              squish={false}
              hapticFeedback={hapticFeedback}
              className="balance-hall__player-hit"
              aria-label={`Character ${character.name}. Change player`}
              onClick={() => {
                if (walking || steppingIn) return
                setPage('character')
              }}
            >
              <span className="balance-hall__player-face" aria-hidden>
                <span key={hopKey} className={`balance-hall__player-art${walking ? ' is-hopping' : ''}`}>
                  <img src={character.asset} alt="" draggable={false} />
                </span>
              </span>
            </Pressable>
          </div>
        </div>

        <div className="balance-hall__roster" role="radiogroup" aria-label="Game character">
          {PRACTICE_GAME_CHARACTERS.map((option) => {
            const selected = option.id === characterId
            return (
              <Pressable
                key={option.id}
                type="button"
                intensity="soft"
                hapticFeedback={hapticFeedback}
                className={`balance-hall__roster-pick ${selected ? 'is-selected' : ''}`}
                role="radio"
                aria-checked={selected}
                aria-label={`Use ${option.name} in Staff Jumper and Balance`}
                onClick={() => selectCharacter(option.id)}
              >
                <span aria-hidden>
                  <img src={option.asset} alt="" draggable={false} />
                  {selected ? <Check /> : null}
                </span>
                <strong>{option.name}</strong>
              </Pressable>
            )
          })}
        </div>
      </div>
    </BalanceArcadeShell>
  )
}
