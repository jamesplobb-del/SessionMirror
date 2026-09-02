import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import './styles/drone-keyboard.css'
import './styles/drone-sound-wheel.css'
import './styles/practice-system.css'
import './styles/practice-hub.css'
import './styles/quick-tuner.css'
import './styles/pitch-insights.css'
// Keep adaptive iPad overrides last so feature-specific styles cannot restore
// phone-sized width caps after the tablet layout has been applied.
import './styles/tablet.css'
// Interaction and appearance polish is intentionally last: it only supplies
// shared state transitions and theme contrast, never structural layout.
import './styles/interaction-polish.css'
import RootRouter from './RootRouter.tsx'
import AppErrorBoundary from './components/ui/AppErrorBoundary.tsx'
import { primeWebStatusBarChrome } from './utils/nativeStatusBar'
import { registerAppForegroundLifecycle } from './utils/appForeground'
import { initializeQuickTunerLaunch } from './utils/quickTunerLaunch'
import { initCrashReporting } from './utils/crashReporting'
import { initializeRoutineFileOpen } from './practiceTimeline/storage/routineFileOpen'

async function bootstrap() {
  // First thing, before any other init — anything that throws during boot
  // (filesystem, SQLite, quick-tuner launch) should still get reported.
  initCrashReporting()

  const rootEl = document.getElementById('root')
  if (!rootEl) return

  primeWebStatusBarChrome()
  registerAppForegroundLifecycle()
  // Not awaited — a routine tapped in Messages surfaces through its own
  // store once ready, and shouldn't hold up first paint.
  void initializeRoutineFileOpen()

  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <MotionConfig reducedMotion="user">
          <RootRouter />
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
