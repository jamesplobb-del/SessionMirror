import { useState } from 'react'
import { Check, Gamepad2, Music4, Play, Trophy, Wind, X } from 'lucide-react'
import balanceShot from '../../assets/games/balance.jpg'
import learnInstrumentShot from '../../assets/games/learn-instrument.jpg'
import staffJumperShot from '../../assets/games/staff-jumper.jpg'
import {
  getPracticeGameCharacter,
  loadPracticeGameCharacter,
  PRACTICE_GAME_CHARACTERS,
  savePracticeGameCharacter,
  type PracticeGameCharacterId,
} from '../../labs/practiceGameCharacters'
import { loadBestScore as loadStaffJumperBestScore } from '../../labs/staffJumper/staffJumperMusicLogic'
import { formatBalanceDuration, loadBalanceBestMs } from '../../labs/balance/balanceStorage'
import Pressable from '../ui/Pressable'

interface LabsMenuProps {
  hapticFeedback: boolean
  onOpenStaffJumper: () => void
  onOpenBalance: () => void
  onOpenLearnInstrument: () => void
  onBack: () => void
}
export default function LabsMenu({
  hapticFeedback,
  onOpenStaffJumper,
  onOpenBalance,
  onOpenLearnInstrument,
  onBack,
}: LabsMenuProps) {
  const staffJumperBest = loadStaffJumperBestScore()
  const balanceBest = loadBalanceBestMs()
  const [selectedCharacterId, setSelectedCharacterId] = useState<PracticeGameCharacterId>(
    loadPracticeGameCharacter,
  )
  const selectedCharacter = getPracticeGameCharacter(selectedCharacterId)

  const selectCharacter = (id: PracticeGameCharacterId) => {
    setSelectedCharacterId(id)
    savePracticeGameCharacter(id)
  }

  return (
    <div className="arcade-menu flex min-h-0 flex-1 flex-col">
      <div className="arcade-menu__topbar">
        <div className="arcade-wordmark">
          <span className="arcade-wordmark__mark" aria-hidden>
            <Gamepad2 />
          </span>
          <span>
            <strong>
              Practice Games <span className="arcade-wordmark__beta">(Beta)</span>
            </strong>
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

      <header className="arcade-menu__hero">
        <p className="arcade-kicker">Play your instrument</p>
        <h1>Choose a game</h1>
        <p>Your microphone hears every note — no buttons, no tapping.</p>
      </header>

      <section className="arcade-character-picker" aria-labelledby="arcade-character-title">
        <header>
          <span>
            <small>Character</small>
            <h2 id="arcade-character-title">{selectedCharacter.name}</h2>
          </span>
          <p>Staff Jumper &amp; Balance</p>
        </header>
        <div className="arcade-character-picker__rail" role="radiogroup" aria-label="Game character">
          {PRACTICE_GAME_CHARACTERS.map((character) => {
            const selected = selectedCharacterId === character.id
            return (
              <Pressable
                key={character.id}
                type="button"
                intensity="soft"
                hapticFeedback={hapticFeedback}
                className={`arcade-character-option ${selected ? 'is-selected' : ''}`}
                role="radio"
                aria-checked={selected}
                aria-label={`Use ${character.name} in Staff Jumper and Balance`}
                onClick={() => selectCharacter(character.id)}
              >
                <span aria-hidden>
                  <img
                    src={character.asset}
                    alt=""
                    draggable={false}
                    style={{ transform: `scale(${character.scale})` }}
                  />
                  {selected && <Check />}
                </span>
              </Pressable>
            )
          })}
        </div>
      </section>

      <div className="arcade-menu__section-head">
        <h2>Games</h2>
        <span>3 available</span>
      </div>

      <ul className="arcade-game-list">
        <li>
          <Pressable
            type="button"
            intensity="normal"
            hapticFeedback={hapticFeedback}
            onClick={onOpenLearnInstrument}
            className="arcade-game-card arcade-game-card--wind"
            aria-label="Open Learn Your Instrument"
          >
            <span className="arcade-game-card__copy">
              <span className="arcade-game-card__badge">
                <Wind aria-hidden /> Note by note
              </span>
              <h3>Learn Your Instrument</h3>
              <p>See the note, match the fingering chart, and play it.</p>
              <span className="arcade-game-card__meta">
                <span>7 instruments · beginner</span>
              </span>
            </span>
            <span className="arcade-game-card__art arcade-game-card__art--wind" aria-hidden>
              <img className="arcade-game-card__shot" src={learnInstrumentShot} alt="" decoding="async" />
              <span className="arcade-game-card__go"><Play aria-hidden /></span>
            </span>
          </Pressable>
        </li>
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
              <p>Read the note under the player and hop it across the staff.</p>
              <span className="arcade-game-card__meta">
                <span>
                  <Trophy aria-hidden /> Best {staffJumperBest || '—'}
                </span>
              </span>
            </span>
            <span className="arcade-game-card__art arcade-game-card__art--staff" aria-hidden>
              <img className="arcade-game-card__shot" src={staffJumperShot} alt="" decoding="async" />
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
              <img className="arcade-game-card__shot" src={balanceShot} alt="" decoding="async" />
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
