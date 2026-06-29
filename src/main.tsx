import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/drone-keyboard.css'
import './styles/drone-sound-wheel.css'
import App from './App.tsx'
import { initHeadphoneOutputDetection } from './utils/headphoneOutput'
import { primeWebStatusBarChrome } from './utils/nativeStatusBar'
import { registerKeepAwakeLifecycle } from './utils/keepScreenAwake'

function bootstrap() {
  const rootEl = document.getElementById('root')
  if (!rootEl) return

  primeWebStatusBarChrome()
  registerKeepAwakeLifecycle()
  initHeadphoneOutputDetection()

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()
