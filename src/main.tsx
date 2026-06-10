import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initVaultDatabase } from './db'
import { bootstrapViewport } from './utils/viewportSync'
import { lockPortraitOrientation } from './utils/lockPortraitOrientation'
import { agentDebugLog } from './utils/agentDebugLog'

const bootStartedAt = typeof performance !== 'undefined' ? performance.now() : 0

function showVaultBootError(): void {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100dvh;padding:24px;background:#000;color:#f5f5f4;font-family:system-ui,sans-serif;text-align:center"><p>BestTake could not open its vault database. Restart the app or reinstall if this continues.</p></div>'
}

function bootstrap() {
  bootstrapViewport()
  void lockPortraitOrientation()

  const rootEl = document.getElementById('root')
  if (!rootEl) return

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )

  // #region agent log
  agentDebugLog(
    'main.tsx:bootstrap',
    'react tree mounted',
    { msSinceBoot: Math.round(performance.now() - bootStartedAt) },
    'H-BOOT',
  )
  // #endregion

  void initVaultDatabase().then(() => {
    // #region agent log
    agentDebugLog(
      'main.tsx:bootstrap',
      'vault database ready',
      { msSinceBoot: Math.round(performance.now() - bootStartedAt) },
      'H-BOOT',
    )
    // #endregion
  }).catch((error) => {
    console.error('Failed to initialize vault database', error)
    showVaultBootError()
  })
}

bootstrap()
