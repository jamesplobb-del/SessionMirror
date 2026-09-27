import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import './styles/drone-keyboard.css'
import './styles/drone-sound-wheel.css'
import './styles/practice-system.css'
import './styles/practice-hub.css'
import './styles/practice-routines.css'
import './styles/quick-tuner.css'
import './styles/pitch-insights.css'
// Keep adaptive iPad overrides last so feature-specific styles cannot restore
// phone-sized width caps after the tablet layout has been applied.
import './styles/tablet.css'
// Interaction and appearance polish is intentionally last: it only supplies
// shared state transitions and theme contrast, never structural layout.
import './styles/interaction-polish.css'
import RootRouter from './RootRouter.tsx'
import PlusPaywall from './plus/PlusPaywall'
import { initializePlusAccess } from './plus/plusAccess'
import AppErrorBoundary from './components/ui/AppErrorBoundary.tsx'
import { primeWebStatusBarChrome } from './utils/nativeStatusBar'
import { registerAppForegroundLifecycle } from './utils/appForeground'
import { initializeQuickTunerLaunch } from './utils/quickTunerLaunch'
import { initCrashReporting } from './utils/crashReporting'
import { initializeRoutineFileOpen } from './practiceTimeline/storage/routineFileOpen'
import { initializeMultitrackFileOpen } from './multitrack/state/multitrackFileOpen'
import { initializePdfFileOpen } from './utils/incomingPdfOpen'
import { installFakeMediaDevices } from './utils/fakeMediaDevices'

document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.dataset.arcadeStyle = 'arcade-pop'
document.documentElement.id = 'lens-design-system'
document.documentElement.classList.add('lens-system', 'premium-app')
document.documentElement.dataset.lensFinish = 'glass'

async function bootstrap() {
  // Before anything can touch mediaDevices. No-op unless VITE_FAKE_MEDIA=1.
  installFakeMediaDevices()

  // First thing, before any other init — anything that throws during boot
  // (filesystem, SQLite, quick-tuner launch) should still get reported.
  initCrashReporting()

  const rootEl = document.getElementById('root')
  if (!rootEl) return

  primeWebStatusBarChrome()
  registerAppForegroundLifecycle()
  initializePlusAccess()
  // Not awaited — a routine tapped in Messages surfaces through its own
  // store once ready, and shouldn't hold up first paint.
  void initializeRoutineFileOpen()
  void initializeMultitrackFileOpen().catch(error => console.warn('Project file opening unavailable', error))
  void initializePdfFileOpen()

  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <MotionConfig reducedMotion="user">
          <RootRouter />
          <PlusPaywall />
        </MotionConfig>
      </AppErrorBoundary>
    </StrictMode>,
  )

  // Native quick-action handoff is allowed to arrive after the shell mounts.
  // Awaiting this bridge call before React rendered left a completely black
  // WebView whenever iOS resumed with a busy or recovering plugin queue.
  void initializeQuickTunerLaunch()
}

void bootstrap()

// Approved Electric design and Arcade Pop game presentation.
import './styles/refinement-concepts.css'
import './styles/direction-concepts.css'
import './styles/playful-main-tabs.css'
import './styles/alternate-main-tabs.css'
import './styles/fresh-concept.css'
import './styles/fresh-family.css'
import './styles/vibrant-depth.css'
import './styles/camera-transparent-concepts.css'
import './styles/electric-refinement.css'
import './styles/arcade-style-concepts.css'
import './styles/signal-launch.css'

import './styles/midnight-electric.css'

import './styles/reactive-silk-tuner.css'
import './styles/open-lens.css'
// The approved multitrack workspace is scoped independently of Camera's controls.
import './styles/multitrack-quiet.css'

// Approved shared presentation; capture and playback remain in their existing components.
import './styles/open-lens-system.css'
import './styles/pocket-arcade.css'

// Premium finish preserves today's Home layout and the separate game theme.
import './styles/premium-app.css'
import './styles/premium-interactions.css'

import './styles/premium-routines.css'
