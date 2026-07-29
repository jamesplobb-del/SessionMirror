import { lazy, Suspense, useSyncExternalStore } from 'react'
import QuickTunerScreen from './components/QuickTunerScreen'
import {
  dismissQuickTuner,
  getQuickTunerLaunchSnapshot,
  subscribeQuickTunerLaunch,
} from './utils/quickTunerLaunch'

const FullBestTakeApp = lazy(() => import('./App'))

export default function RootRouter() {
  const quickTunerRequest = useSyncExternalStore(
    subscribeQuickTunerLaunch,
    getQuickTunerLaunchSnapshot,
    getQuickTunerLaunchSnapshot,
  )

  if (quickTunerRequest) {
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
