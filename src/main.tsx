import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/drone-keyboard.css'
import './styles/drone-sound-wheel.css'
import App from './App.tsx'
import AppErrorBoundary from './components/ui/AppErrorBoundary.tsx'
import { initHeadphoneOutputDetection } from './utils/headphoneOutput'
import { primeWebStatusBarChrome } from './utils/nativeStatusBar'
import { registerKeepAwakeLifecycle } from './utils/keepScreenAwake'
import { registerAppForegroundLifecycle } from './utils/appForeground'

function bootstrap() {
  const rootEl = document.getElementById('root')
  if (!rootEl) return

  primeWebStatusBarChrome()
  registerAppForegroundLifecycle()
  registerKeepAwakeLifecycle()
  initHeadphoneOutputDetection()

  createRoot(rootEl).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

bootstrap()
