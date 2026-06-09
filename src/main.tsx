import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { bootstrapViewport } from './utils/viewportSync'

// Sync before first paint — iOS cold boot often reports a short viewport until rotation.
bootstrapViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
