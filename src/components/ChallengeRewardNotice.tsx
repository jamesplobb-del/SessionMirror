import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Trophy, X } from 'lucide-react'
import { CHALLENGE_REWARD, CHALLENGE_SAVE_FAILED, retryChallengeRewards, type ChallengeReward } from '../utils/dailyChallenges'
import { PRACTICE_GAME_CHARACTERS } from '../labs/practiceGameCharacters'
import './daily-challenges.css'
export default function ChallengeRewardNotice() {
  const [saveError, setSaveError] = useState(false)
  const [reward, setReward] = useState<ChallengeReward | null>(null)
  useEffect(() => {
    const earned = (event: Event) => setReward((event as CustomEvent<ChallengeReward>).detail)
    const failed = () => setSaveError(true)
    window.addEventListener(CHALLENGE_REWARD, earned)
    window.addEventListener(CHALLENGE_SAVE_FAILED, failed)
    return () => { window.removeEventListener(CHALLENGE_REWARD, earned); window.removeEventListener(CHALLENGE_SAVE_FAILED, failed) }
  }, [])
  useEffect(() => { if (!reward) return; const timer = window.setTimeout(() => setReward(null), 7000); return () => window.clearTimeout(timer) }, [reward])
  if (saveError) return createPortal(<aside className="challenge-reward-notice" role="alert"><span><strong>Your trophy couldn’t be saved</strong><small>Your challenge is complete. Retry saving before closing the app.</small></span><button onClick={() => setSaveError(!retryChallengeRewards())}>Retry</button></aside>, document.body)
  if (!reward) return null
  const names = PRACTICE_GAME_CHARACTERS.filter(c => reward.unlocked.includes(c.id)).map(c => c.name)
  return createPortal(<aside className="challenge-reward-notice" role="status" aria-live="polite">
    <Trophy aria-hidden /><span><strong>Challenge complete · +1 trophy</strong><small>{names.length ? `${names.join(', ')} unlocked! Choose your player in the collection.` : `${reward.total} trophies earned. A little practice adds up.`}</small></span><button onClick={() => setReward(null)} aria-label="Dismiss reward"><X aria-hidden /></button>
  </aside>, document.body)
}
