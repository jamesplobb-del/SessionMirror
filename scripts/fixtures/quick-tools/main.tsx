import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import QuickTunerScreen from '../../../src/components/QuickTunerScreen'
import QuickMetronomeScreen from '../../../src/components/QuickMetronomeScreen'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import '../../../src/index.css'
import '../../../src/styles/drone-keyboard.css'
import '../../../src/styles/drone-sound-wheel.css'
import '../../../src/styles/practice-system.css'
import '../../../src/styles/practice-hub.css'
import '../../../src/styles/practice-routines.css'
import '../../../src/styles/quick-tuner.css'
import '../../../src/styles/pitch-insights.css'
import '../../../src/styles/tablet.css'
import '../../../src/styles/interaction-polish.css'
import '../../../src/styles/refinement-concepts.css'
import '../../../src/styles/direction-concepts.css'
import '../../../src/styles/playful-main-tabs.css'
import '../../../src/styles/alternate-main-tabs.css'
import '../../../src/styles/fresh-concept.css'
import '../../../src/styles/fresh-family.css'
import '../../../src/styles/vibrant-depth.css'
import '../../../src/styles/camera-transparent-concepts.css'
import '../../../src/styles/electric-refinement.css'
import '../../../src/styles/arcade-style-concepts.css'
import '../../../src/styles/signal-launch.css'
import '../../../src/styles/midnight-electric.css'
import '../../../src/styles/reactive-silk-tuner.css'
import '../../../src/styles/open-lens.css'
import '../../../src/styles/multitrack-quiet.css'
import '../../../src/styles/open-lens-system.css'
import '../../../src/styles/pocket-arcade.css'
// Render the production quick-launch components without loading the recording workspace.
const destination = new URLSearchParams(location.search).get('tool') === 'tuner' ? 'tuner' : 'metronome'
document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.id = 'lens-design-system'
document.documentElement.classList.add('lens-system')
document.documentElement.dataset.lensFinish = 'glass'
const request = { id: 'quick-tools-review', destination, source: 'inAppSettings', requestedAt: Date.now(), coldLaunch: true } as const
const dark = new URLSearchParams(location.search).get('dark') === '1'
const onExit = () => { location.href = `?tool=${destination === 'tuner' ? 'metronome' : 'tuner'}&dark=${dark ? '1' : '0'}` }
function Review() {
  useEffect(() => {
    document.documentElement.classList.toggle('app-dark-mode', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }, [])
  return destination === 'tuner' ? <QuickTunerScreen request={request} onExit={onExit} /> : <QuickMetronomeScreen request={request} onExit={onExit} />
}
createRoot(document.getElementById('root')!).render(
  <MotionConfig reducedMotion="user"><ActionSheetProvider>
    <Review />
  </ActionSheetProvider></MotionConfig>,
)
