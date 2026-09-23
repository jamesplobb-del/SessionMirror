import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import RoutineMetronomeEditor from '../../../src/components/RoutineMetronomeEditor'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import { normalizeDeskMetronome } from '../../../src/utils/deskMetronome'
import type { MetronomePrefs } from '../../../src/utils/metronomeConfig'
import '../../../src/index.css'
import '../../../src/styles/routine-guide.css'
import '../../../src/styles/open-lens-system.css'
import './routine-metronome-frame.css'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('app-dark-mode', params.get('dark') === '1')
let initial: unknown = {}
try { initial = JSON.parse(params.get('prefs') ?? '{}') } catch { /* Neutral defaults for a direct visit. */ }
const prefs = normalizeDeskMetronome(initial)
const requestId = params.get('request')

function EditorFrame() {
  const [open, setOpen] = useState(true)
  const saved = useRef<MetronomePrefs | null>(null)
  // Let the production editor stop playback and restore its engine settings
  // before the parent removes the iframe. A cancel never carries preferences.
  useEffect(() => {
    if (!open) window.parent.postMessage({
      type: 'routine-music-metronome', requestId,
      action: saved.current ? 'save' : 'cancel', prefs: saved.current,
    }, location.origin)
  }, [open])
  return <MetronomeProvider><RoutineMetronomeEditor isOpen={open} value={prefs}
    onSave={next => { saved.current = next }} onClose={() => setOpen(false)} /></MetronomeProvider>
}

// The real editor persists and restores its metronome preferences on this
// isolated preview origin. Never mount it on the live app's port.
createRoot(document.getElementById('root')!).render(
  location.port === '5195' ? <EditorFrame /> : <p>Open this preview on port 5195.</p>,
)
