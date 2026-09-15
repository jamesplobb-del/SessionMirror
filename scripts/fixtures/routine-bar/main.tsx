import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import RoutineBar from '../../../src/components/RoutineBar'
import { buildGoalRoutine } from '../../../src/utils/routineGoals'
import '../../../src/index.css'
import '../../../src/styles/practice-routines.css'

const routine = buildGoalRoutine('trumpet', 'sound')
const noop = () => {}
function Review() {
  const [dark, setDark] = useState(false)
  return <main style={{ minHeight: '100vh', padding: 24, background: dark ? '#172031' : '#f4f5f7' }}>
    <button onClick={() => setDark(value => !value)}>Switch surface</button>
    <RoutineBar routine={routine} step={routine.steps[0]} nextStep={routine.steps[1]} day={null}
      startedAt={null} paused audioSurface={!dark} tunerTransposition="concert" hapticFeedback={false}
      onResume={noop} onPause={noop} onClose={noop} onDone={noop} onJumpToStep={noop} onOpenToday={noop} />
  </main>
}
createRoot(document.getElementById('root')!).render(<Review />)
