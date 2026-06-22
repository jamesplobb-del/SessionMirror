import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initVaultDatabase } from './db'
import { initAppFilesystem } from './utils/filesystemInit'
import { bootstrapViewport } from './utils/viewportSync'
import { lockPortraitOrientation } from './utils/lockPortraitOrientation'
import { resumePlaybackAudioContext } from './utils/playbackAudioContext'

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

  void Promise.all([initVaultDatabase(), initAppFilesystem()]).then(() => {
    const warmRuntime = () => {
      void resumePlaybackAudioContext()
    }
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(warmRuntime, { timeout: 2500 })
    } else {
      window.setTimeout(warmRuntime, 400)
    }
  }).catch((error) => {
    console.error('Failed to initialize vault database', error)
    showVaultBootError()
  })
}

bootstrap()
