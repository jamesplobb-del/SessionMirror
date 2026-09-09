import { useEffect, useRef, useState } from 'react'
import { Trophy, Check, ChevronRight, X, LockKeyhole } from 'lucide-react'
import { CHALLENGE_CHANGED, CHARACTER_COSTS, characterUnlocked, loadChallengeProgress, trophyCount } from '../utils/dailyChallenges'
import { getDailyChallengePlan, recordPlannedRoutine, type DailyChallengePlan } from '../utils/dailyChallengePlan'
import { PRACTICE_GAME_CHARACTERS, getPracticeGameCharacter, loadPracticeGameCharacter, savePracticeGameCharacter, type PracticeGameCharacterId } from '../labs/practiceGameCharacters'
import { loadRoutineDay, type Routine, type RoutineDay } from '../utils/practiceRoutines'
import './daily-challenges.css'

export default function DailyChallenges({ routine, day, instrumentId, onPractice, onGame }: {
  routine: Routine | null; day: RoutineDay | null; instrumentId: string | null
  onPractice: (plan: DailyChallengePlan) => void; onGame: (plan: DailyChallengePlan) => void
}) {
  const [progress, setProgress] = useState(loadChallengeProgress)
  const [plan, setPlan] = useState<DailyChallengePlan | null>(null)
  const [error, setError] = useState(false)
  const [collection, setCollection] = useState(false)
  const [selected, setSelected] = useState(loadPracticeGameCharacter)
  const [selectionError, setSelectionError] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const refresh = () => {
    setProgress(loadChallengeProgress())
    try { setPlan(getDailyChallengePlan(instrumentId ?? routine?.instrumentId ?? null, routine)); setError(false); recordPlannedRoutine(day) }
    catch { setError(true); setPlan(null) }
  }
  useEffect(() => {
    refresh()
    window.addEventListener(CHALLENGE_CHANGED, refresh)
    window.addEventListener('storage', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => { window.removeEventListener(CHALLENGE_CHANGED, refresh); window.removeEventListener('storage', refresh); document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer) }
  }, [instrumentId, routine])
  useEffect(() => {
    if (!collection) return
    setSelected(loadPracticeGameCharacter())
    const dialog = dialogRef.current
    const previous = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus() }
  }, [collection])
  const player = getPracticeGameCharacter(selected)
  const total = trophyCount(progress)
  const next = PRACTICE_GAME_CHARACTERS.find(item => !characterUnlocked(item.id, progress))
  const practiceDone = Boolean(plan && progress.awards[`${plan.date}:practice`])
  const gameDone = Boolean(plan && progress.awards[`${plan.date}:game`])
  const step = plan?.practice.routine.steps[0]
  const matchingDay = plan && day?.routineId && [plan.practice.routine.id, plan.practice.sourceRoutineId].includes(day.routineId) ? day : plan ? loadRoutineDay(plan.practice.routine) : null
  const elapsed = step && matchingDay?.date === plan?.date ? matchingDay?.elapsedMsByStep[step.id] ?? 0 : 0
  const choose = (id: PracticeGameCharacterId) => {
    if (!characterUnlocked(id, progress)) return
    savePracticeGameCharacter(id)
    const saved = loadPracticeGameCharacter()
    setSelected(saved)
    setSelectionError(saved !== id)
  }
  return <section className="daily-challenges" aria-label="Today's challenges">
    <header><div><strong>Today’s challenges</strong><small>Two small wins for your music</small></div><button onClick={() => setCollection(true)} aria-label={`Open collection, ${total} trophies`}><Trophy aria-hidden /> {total}</button></header>
    {error ? <div role="status"><p>Challenges couldn’t be saved on this device. Your practice tools still work.</p><button onClick={refresh}>Try again</button></div> : plan && <>
      <button className="daily-challenges__item" onClick={() => onPractice(plan)} aria-label={`${step?.title}. ${plan.practice.hint} ${practiceDone ? 'Completed. Practice again.' : 'Earn one trophy.'}`}>
        <span className={`daily-challenges__mark ${practiceDone ? 'is-done' : ''}`}>{practiceDone ? <Check aria-hidden /> : '01'}</span>
        <span className="daily-challenges__copy"><strong>{step?.title}</strong><small>{practiceDone ? 'Complete · Practice again' : `${elapsed > 0 ? `${Math.min(60, Math.floor(elapsed / 1000))}/60 seconds · ` : '1 minute · '}Finish the exercise to earn 1 trophy`}</small></span><ChevronRight aria-hidden />
      </button>
      <button className="daily-challenges__item" onClick={() => onGame(plan)} aria-label={`${plan.game.title}. ${plan.game.objective} ${gameDone ? 'Completed. Play again.' : 'Earn one trophy.'}`}>
        <span className={`daily-challenges__mark ${gameDone ? 'is-done' : ''}`}>{gameDone ? <Check aria-hidden /> : '02'}</span>
        <span className="daily-challenges__copy"><strong>{plan.game.title}</strong><small>{gameDone ? 'Complete · Play again' : `${plan.game.route === 'staff-jumper' ? '8 correct notes' : 'Today’s Balance run'} · 1 trophy`}</small></span><ChevronRight aria-hidden />
      </button>
      <span className="daily-challenges__completion" aria-live="polite">{practiceDone && gameDone ? 'Both complete. Your next challenges arrive tomorrow.' : `${plan.instrumentLabel} · New challenges each day`}</span>
    </>}
    <button className="daily-challenges__collection" onClick={() => setCollection(true)}>
      {next ? <><img src={next.asset} alt="" /><span><strong>{next.name} is next</strong><small>{Math.max(0, CHARACTER_COSTS[next.id] - total)} more trophies to unlock</small></span></> : <span>Your character collection</span>}<ChevronRight aria-hidden />
    </button>
    {collection && <dialog ref={dialogRef} className="challenge-collection" onCancel={() => setCollection(false)} onClose={() => setCollection(false)} aria-labelledby="challenge-collection-title">
      <header><span><Trophy aria-hidden /> {total} trophies</span><button onClick={() => setCollection(false)} aria-label="Close collection"><X aria-hidden /></button></header>
      <h2 id="challenge-collection-title">Your players</h2>
      <p>Earn trophies through daily practice. Unlock a player once, and use it in Staff Jumper and Balance. Your trophies are never spent.</p>
      <div className="challenge-collection__grid">{PRACTICE_GAME_CHARACTERS.map(item => {
        const unlocked = characterUnlocked(item.id, progress)
        const active = item.id === selected
        return <button key={item.id} disabled={!unlocked} className={`${unlocked ? 'is-unlocked' : ''} ${active ? 'is-selected' : ''}`} onClick={() => choose(item.id)} aria-pressed={active} aria-label={`${item.name}. ${unlocked ? active ? 'Selected' : 'Choose player' : `${CHARACTER_COSTS[item.id]} trophies to unlock`}`}>
          <img src={item.asset} alt="" /><strong>{item.name}</strong><small>{item.instrument}</small><span>{unlocked ? active ? <><Check aria-hidden /> Selected</> : 'Choose player' : <><LockKeyhole aria-hidden /> {total}/{CHARACTER_COSTS[item.id]} trophies</>}</span>
          {!unlocked && <progress max={CHARACTER_COSTS[item.id]} value={Math.min(total, CHARACTER_COSTS[item.id])} aria-label={`Progress to ${item.name}`} />}
        </button>
      })}</div>
      <p className="challenge-collection__personality" aria-live="polite"><strong>{player.name}</strong> · {player.personality}</p>
      {selectionError && <p role="alert">Your player couldn’t be saved. Please try again.</p>}
      <footer>Two daily challenges. No streak to lose. Existing Balance rewards still count as character unlocks.</footer>
    </dialog>}
  </section>
}
