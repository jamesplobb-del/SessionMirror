import {
  ChevronRight,
  X,
} from 'lucide-react'
import { loadBestScore as loadScaleRushBestScore } from '../../labs/scaleRush/scaleRushMusicLogic'
import { loadBestScore as loadStaffJumperBestScore } from '../../labs/staffJumper/staffJumperMusicLogic'
import Pressable from '../ui/Pressable'

interface LabsMenuProps {
  hapticFeedback: boolean
  onOpenScaleRush: () => void
  onOpenStaffJumper: () => void
  onBack: () => void
}

export default function LabsMenu({
  hapticFeedback,
  onOpenScaleRush,
  onOpenStaffJumper,
  onBack,
}: LabsMenuProps) {
  const scaleRushBest = loadScaleRushBestScore()
  const staffJumperBest = loadStaffJumperBestScore()

  return (
    <div className="arcade-menu flex min-h-0 flex-1 flex-col">
      <div className="arcade-menu__topbar">
        <div className="arcade-wordmark">
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
          aria-label="Close Practice Arcade"
        >
          <X aria-hidden />
        </Pressable>
      </div>

      <header className="arcade-menu__hero">
        <h1>Choose a game</h1>
        <p>Play using your instrument and microphone.</p>
      </header>

      <ul className="arcade-game-list">
        <li>
          <Pressable
            type="button"
            intensity="normal"
            hapticFeedback={hapticFeedback}
            onClick={onOpenScaleRush}
            className="arcade-game-card arcade-game-card--rush"
            aria-label={`Play Scale Rush. Personal best ${scaleRushBest}`}
          >
            <span className="arcade-game-card__copy">
              <h3>Scale Rush</h3>
              <p>Scale patterns</p>
              <span className="arcade-game-card__meta">
                Best {scaleRushBest || '—'}
              </span>
            </span>
            <span className="arcade-game-card__arrow" aria-hidden>
              <ChevronRight />
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
              <h3>Staff Jumper</h3>
              <p>Staff reading</p>
              <span className="arcade-game-card__meta">
                Best {staffJumperBest || '—'}
              </span>
            </span>
            <span className="arcade-game-card__arrow" aria-hidden>
              <ChevronRight />
            </span>
          </Pressable>
        </li>
      </ul>

      <p className="arcade-menu__footer-note">
        Microphone access is required.
      </p>
    </div>
  )
}
