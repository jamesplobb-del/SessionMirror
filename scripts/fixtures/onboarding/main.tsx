import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import OnboardingTutorial from '../../../src/components/OnboardingTutorial'
if (new URLSearchParams(location.search).has('dark')) document.documentElement.classList.add('app-dark-mode')
function Preview() {
  const [result, setResult] = useState('')
  const [instrument, setInstrument] = useState('')
  return result ? <main style={{padding:32,fontFamily:'system-ui'}}><h1>{result}</h1><p>Selected instrument: {instrument || 'Not selected'}</p><p>This preview demonstrates the introduction. In the app, these buttons open Home or the routine builder.</p><button onClick={() => setResult('')}>Replay introduction</button></main> : <OnboardingTutorial
    hapticFeedback={false} onComplete={() => setResult('Home')} onSkip={() => setResult('Skipped to Home')} onQuickPlay={() => setResult('Quick Play')}
    onSelectInstrument={setInstrument} initialInstrumentId={instrument}
    onChooseRoutine={mode => setResult(`Routine builder: ${mode}`)} />
}
createRoot(document.getElementById('root')!).render(<Preview />)
