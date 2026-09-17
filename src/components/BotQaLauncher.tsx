import Pressable from './ui/Pressable'
import { BOT_QA_MODE } from '../utils/botQaMode'
import './bot-qa-launcher.css'

interface BotQaLauncherProps {
  onOpenGames: () => void
  onOpenMultitrack: () => void
}

/**
 * Dev-only jump bar so a bot does not have to discover the long-press
 * Workspace wheel. Never rendered when `BOT_QA_MODE` is false.
 */
export default function BotQaLauncher({ onOpenGames, onOpenMultitrack }: BotQaLauncherProps) {
  if (!BOT_QA_MODE) return null

  return (
    <div className="bot-qa-launcher" data-qa="bot-qa-bar" role="region" aria-label="Bot QA shortcuts">
      <span className="bot-qa-launcher__badge">QA</span>
      <Pressable
        type="button"
        intensity="soft"
        className="bot-qa-launcher__btn"
        data-qa="open-games"
        onClick={onOpenGames}
      >
        Games
      </Pressable>
      <Pressable
        type="button"
        intensity="soft"
        className="bot-qa-launcher__btn"
        data-qa="open-multitrack"
        onClick={onOpenMultitrack}
      >
        Multitrack
      </Pressable>
    </div>
  )
}
