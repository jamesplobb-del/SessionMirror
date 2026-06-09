import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyViewportCssVars } from './utils/viewportSync'

// Sync before first paint — iPhone cold boot often reports a short viewport until rotation.
applyViewportCssVars()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
