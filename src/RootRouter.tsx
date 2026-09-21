import { Component, lazy, Suspense, useSyncExternalStore, type ReactNode } from 'react'
import AppBootGate from './components/ui/AppBootGate'
import QuickTunerScreen from './components/QuickTunerScreen'
import { ActionSheetProvider } from './context/ActionSheetContext'
import {
  dismissQuickTuner,
  getQuickTunerLaunchSnapshot,
  subscribeQuickTunerLaunch,
} from './utils/quickTunerLaunch'

const FullBestTakeApp = lazy(() => import('./App'))
const QuickMetronomeScreen = lazy(() => import('./components/QuickMetronomeScreen'))

function AppLaunchFallback() { return <AppBootGate /> }

interface QuickToolErrorBoundaryProps {
  requestId: string
  onExit: () => void
  children: ReactNode
}

interface QuickToolErrorBoundaryState {
  hasError: boolean
}

class QuickToolErrorBoundary extends Component<
  QuickToolErrorBoundaryProps,
  QuickToolErrorBoundaryState
> {
  state: QuickToolErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): QuickToolErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[QuickToolErrorBoundary] Quick tool render failure', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="quick-tool-error app-ui-overlay--audio-mode">
          <h2 className="text-lg font-semibold">Quick Tool Unavailable</h2>
          <p>
            Tap below to open BestTake.
          </p>
          <button
            type="button"
            onClick={this.props.onExit}
            className="quick-tuner-return"
          >
            Open BestTake
          </button>
        </main>
      )
    }
    return this.props.children
  }
}

export default function RootRouter() {
  const quickTunerRequest = useSyncExternalStore(
    subscribeQuickTunerLaunch,
    getQuickTunerLaunchSnapshot,
    getQuickTunerLaunchSnapshot,
  )

  if (quickTunerRequest) {
    const handleExit = () => dismissQuickTuner(quickTunerRequest.id)

    if (quickTunerRequest.destination === 'metronome') {
      return (
        <ActionSheetProvider>
          <QuickToolErrorBoundary requestId={quickTunerRequest.id} onExit={handleExit}>
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
                onExit={handleExit}
              />
            </Suspense>
          </QuickToolErrorBoundary>
        </ActionSheetProvider>
      )
    }

    return (
      <ActionSheetProvider>
        <QuickToolErrorBoundary requestId={quickTunerRequest.id} onExit={handleExit}>
          <QuickTunerScreen
            key={quickTunerRequest.id}
            request={quickTunerRequest}
            onExit={handleExit}
          />
        </QuickToolErrorBoundary>
      </ActionSheetProvider>
    )
  }

  return (
    <Suspense fallback={<AppLaunchFallback />}>
      <FullBestTakeApp />
    </Suspense>
  )
}
