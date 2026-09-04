import { useState } from 'react'
import { Check, ChevronDown, Gamepad2, Music4, Play, Trophy, X } from 'lucide-react'
import { loadBestScore as loadStaffJumperBestScore } from '../../labs/staffJumper/staffJumperMusicLogic'
import { formatBalanceDuration, loadBalanceBestMs } from '../../labs/balance/balanceStorage'
import {
  PRACTICE_GAME_CHARACTERS,
  getPracticeGameCharacter,
  type PracticeGameCharacterId,
} from '../../labs/practiceGameCharacters'
import {
  PRACTICE_GAME_FAMILY_LABELS,
  PRACTICE_GAME_FAMILY_ORDER,
  PRACTICE_GAME_INSTRUMENTS,
  type PracticeGameInstrument,
} from '../../labs/practiceGameInstruments'
import { CLEF_LABELS } from '../../labs/staffJumper/staffNotationMap'
import Pressable from '../ui/Pressable'

interface LabsMenuProps {
  hapticFeedback: boolean
  instrument: PracticeGameInstrument
  characterId: PracticeGameCharacterId
  onInstrumentChange: (instrumentId: string) => void
  onCharacterChange: (characterId: PracticeGameCharacterId) => void
  onOpenStaffJumper: () => void
  onOpenBalance: () => void
  onBack: () => void
}

export default function LabsMenu({
  hapticFeedback,
  instrument,
  characterId,
  onInstrumentChange,
  onCharacterChange,
  onOpenStaffJumper,
  onOpenBalance,
  onBack,
}: LabsMenuProps) {
  const staffJumperBest = loadStaffJumperBestScore()
  const balanceBest = loadBalanceBestMs()
  const character = getPracticeGameCharacter(characterId)
  /**
   * The picker is closed by default: the instrument is set once and then read
   * at a glance, so the menu should show the answer rather than the question.
   */
  const [instrumentPickerOpen, setInstrumentPickerOpen] = useState(false)

  return (
    <div className="arcade-menu flex min-h-0 flex-1 flex-col">
      <div className="arcade-menu__topbar">
        <div className="arcade-wordmark">
          <span className="arcade-wordmark__mark" aria-hidden>
            <Gamepad2 />
          </span>
          <span>
            <strong>Practice Games</strong>
            <span>BestTake</span>
          </span>
        </div>
        <Pressable
          type="button"
          intensity="icon"
          hapticFeedback={hapticFeedback}
          onClick={onBack}
          className="arcade-icon-button"
          aria-label="Close Games"
        >
          <X aria-hidden />
        </Pressable>
      </div>

      {/*
        Instrument first, then the games.

        Both games are played into the microphone, so which instrument is in
        your hands decides what the staff shows and which notes count as right.
        It used to be a line inside each game's setup sheet, where it was easy
        to start a run transposed for somebody else's horn.
      */}
      <section className="arcade-setup" aria-label="Your player">
        <div className="arcade-setup__stage">
          <img
            className="arcade-setup__avatar"
            src={character.asset}
            alt=""
            draggable={false}
            style={{ '--arcade-avatar-scale': character.scale } as React.CSSProperties}
          />
          <span className="arcade-setup__avatar-shadow" aria-hidden />
        </div>

        <div className="arcade-setup__panel">
          <Pressable
            type="button"
            intensity="soft"
            hapticFeedback={hapticFeedback}
            onClick={() => setInstrumentPickerOpen((open) => !open)}
            className={`arcade-instrument ${instrumentPickerOpen ? 'arcade-instrument--open' : ''}`}
            aria-expanded={instrumentPickerOpen}
            aria-label={`Instrument: ${instrument.name}. Change instrument`}
          >
            <span className="arcade-instrument__key" aria-hidden>
              {instrument.keyLabel}
            </span>
            <span className="arcade-instrument__copy">
              <small>Instrument</small>
              <strong>{instrument.name}</strong>
              <span>
                {PRACTICE_GAME_FAMILY_LABELS[instrument.family]} · Reads in {instrument.keyLabel} ·{' '}
                {CLEF_LABELS[instrument.clef]} clef
              </span>
            </span>
            <ChevronDown className="arcade-instrument__chevron" aria-hidden />
          </Pressable>

          {instrumentPickerOpen && (
            <div className="arcade-instrument-picker">
              {PRACTICE_GAME_FAMILY_ORDER.map((family) => {
                const options = PRACTICE_GAME_INSTRUMENTS.filter((item) => item.family === family)
                if (options.length === 0) return null
                return (
                  <div key={family} className="arcade-instrument-picker__group">
                    <p className="arcade-instrument-picker__label">
                      {PRACTICE_GAME_FAMILY_LABELS[family]}
                    </p>
                    <div className="arcade-instrument-picker__grid" role="group" aria-label={PRACTICE_GAME_FAMILY_LABELS[family]}>
                      {options.map((option) => {
                        const selected = option.id === instrument.id
                        return (
                          <Pressable
                            key={option.id}
                            type="button"
                            intensity="soft"
                            hapticFeedback={hapticFeedback}
                            onClick={() => {
                              onInstrumentChange(option.id)
                              setInstrumentPickerOpen(false)
                            }}
                            className={`arcade-instrument-option ${selected ? 'arcade-instrument-option--on' : ''}`}
                            aria-pressed={selected}
                          >
                            <span>{option.name}</span>
                            <em>{option.keyLabel}</em>
                            {selected && <Check aria-hidden />}
                          </Pressable>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="arcade-character-strip" role="group" aria-label="Character">
            <p className="arcade-character-strip__label">Character</p>
            <div className="arcade-character-strip__chips">
              {PRACTICE_GAME_CHARACTERS.map((model) => (
                <Pressable
                  key={model.id}
                  type="button"
                  intensity="soft"
                  hapticFeedback={hapticFeedback}
                  onClick={() => onCharacterChange(model.id)}
                  className={`arcade-character-chip ${model.id === characterId ? 'arcade-character-chip--on' : ''}`}
                  aria-pressed={model.id === characterId}
                  aria-label={`Play as ${model.name}`}
                >
                  <img src={model.asset} alt="" draggable={false} />
                </Pressable>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="arcade-menu__section-head">
        <h2>Games</h2>
        <span>2 available</span>
      </div>

      <ul className="arcade-game-list">
        <li>
          <Pressable
            type="button"
            intensity="normal"
            hapticFeedback={hapticFeedback}
            onClick={onOpenStaffJumper}
            className="arcade-game-card arcade-game-card--staff"
            aria-label={`Play Staff Jumper. Personal best ${staffJumperBest}`}
          >
            <span className="arcade-game-card__copy">
              <span className="arcade-game-card__badge">
                <Music4 aria-hidden /> Sight reading
              </span>
              <h3>Staff Jumper</h3>
              <p>Read the note under the player and hold it for its full value.</p>
              <span className="arcade-game-card__meta">
                <span>
                  <Trophy aria-hidden /> Best {staffJumperBest || '—'}
                </span>
              </span>
            </span>
            <span className="arcade-game-card__art arcade-game-card__art--staff" aria-hidden>
              <span className="arcade-game-card__staff-lines" />
              <span className="arcade-game-card__staff-note" />
              <span className="arcade-game-card__staff-note" />
              <span className="arcade-game-card__staff-note" />
              <span className="arcade-game-card__go">
                <Play aria-hidden />
              </span>
            </span>
          </Pressable>
        </li>
        <li>
          <Pressable
            type="button"
            intensity="normal"
            hapticFeedback={hapticFeedback}
            onClick={onOpenBalance}
            className="arcade-game-card arcade-game-card--balance"
            aria-label={`Play Balance. Personal best ${balanceBest > 0 ? formatBalanceDuration(balanceBest) : 'none'}`}
          >
            <span className="arcade-game-card__copy">
              <span className="arcade-game-card__badge">Long tones</span>
              <h3>Balance</h3>
              <p>Hold the note in tune to keep your player moving.</p>
              <span className="arcade-game-card__meta">
                <span><Trophy aria-hidden /> Best {balanceBest > 0 ? formatBalanceDuration(balanceBest) : '—'}</span>
              </span>
            </span>
            <span className="arcade-game-card__art arcade-game-card__art--balance" aria-hidden>
              <span className="arcade-game-card__balance-cloud" />
              <span className="arcade-game-card__balance-platform" />
              <span className="arcade-game-card__balance-rope" />
              <span className="arcade-game-card__balance-runner"><i /><b /></span>
              <span className="arcade-game-card__go"><Play aria-hidden /></span>
            </span>
          </Pressable>
        </li>
      </ul>

      <p className="arcade-menu__footer-note">
        Microphone access is required. Nothing is recorded — pitch is read live and discarded.
      </p>
    </div>
  )
}
