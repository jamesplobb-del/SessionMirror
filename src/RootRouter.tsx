import { lazy, Suspense, useSyncExternalStore } from 'react'
import QuickTunerScreen from './components/QuickTunerScreen'
import {
  dismissQuickTuner,
  getQuickTunerLaunchSnapshot,
  subscribeQuickTunerLaunch,
} from './utils/quickTunerLaunch'

const FullBestTakeApp = lazy(() => import('./App'))
const QuickMetronomeScreen = lazy(() => import('./components/QuickMetronomeScreen'))

export default function RootRouter() {
  const quickTunerRequest = useSyncExternalStore(
    subscribeQuickTunerLaunch,
    getQuickTunerLaunchSnapshot,
    getQuickTunerLaunchSnapshot,
  )

  if (quickTunerRequest) {
    if (quickTunerRequest.destination === 'metronome') {
      return (
        <Suspense
          fallback={
            <div
              className="quick-tool-loading app-ui-overlay--audio-mode"
              role="status"
              aria-label="Opening Quick Metronome"
            >
              <span>Opening Metronome…</span>
            </div>
          }
        >
          <QuickMetronomeScreen
            key={quickTunerRequest.id}
            request={quickTunerRequest}
            onExit={() => dismissQuickTuner(quickTunerRequest.id)}
          />
        </Suspense>
      )
    }

    return (
      <QuickTunerScreen
        key={quickTunerRequest.id}
        request={quickTunerRequest}
        onExit={() => dismissQuickTuner(quickTunerRequest.id)}
      />
    )
  }

  return (
    <Suspense fallback={null}>
      <FullBestTakeApp />
    </Suspense>
  )
}
