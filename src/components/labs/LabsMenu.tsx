import { Gamepad2, Music4, Play, Trophy, X } from 'lucide-react'
import { loadBestScore as loadStaffJumperBestScore } from '../../labs/staffJumper/staffJumperMusicLogic'
import { formatBalanceDuration, loadBalanceBestMs } from '../../labs/balance/balanceStorage'
import Pressable from '../ui/Pressable'

interface LabsMenuProps {
  hapticFeedback: boolean
  onOpenStaffJumper: () => void
  onOpenBalance: () => void
  onBack: () => void
}
export default function LabsMenu({
  hapticFeedback,
  onOpenStaffJumper,
  onOpenBalance,
  onBack,
}: LabsMenuProps) {
  const staffJumperBest = loadStaffJumperBestScore()
  const balanceBest = loadBalanceBestMs()

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

      <header className="arcade-menu__hero">
        <p className="arcade-kicker">Play your instrument</p>
        <h1>Choose a game</h1>
        <p>Your microphone hears every note — no buttons, no tapping.</p>
      </header>

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
              <p>Read the note under the player and hop it across the staff.</p>
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
