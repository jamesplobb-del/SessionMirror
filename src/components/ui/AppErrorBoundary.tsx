import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  failed: boolean
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary] Unhandled render failure', error, info)
  }

  private reload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="fixed inset-0 flex items-center justify-center bg-black p-6 text-center font-sans text-white">
        <div className="flex max-w-sm flex-col items-center gap-4">
          <h1 className="text-xl font-semibold">BestTake needs to restart</h1>
          <p className="text-sm leading-6 text-white/70">
            Your saved takes are still on this device. Reload BestTake to recover the interface.
          </p>
          <button
            type="button"
            onClick={this.reload}
            className="min-h-11 rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-black"
          >
            Reload BestTake
          </button>
        </div>
      </main>
    )
  }
}
