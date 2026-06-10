import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initVaultDatabase } from './db'
import { bootstrapViewport } from './utils/viewportSync'
import { lockPortraitOrientation } from './utils/lockPortraitOrientation'

async function bootstrap() {
  bootstrapViewport()
  await lockPortraitOrientation()

  try {
    await initVaultDatabase()
  } catch (error) {
    console.error('Failed to initialize vault database', error)
    const root = document.getElementById('root')
    if (root) {
      root.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100dvh;padding:24px;background:#000;color:#f5f5f4;font-family:system-ui,sans-serif;text-align:center"><p>BestTake could not open its vault database. Restart the app or reinstall if this continues.</p></div>'
    }
    return
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
