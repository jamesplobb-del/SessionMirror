import SignalMark from './SignalMark'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

/** Shows the approved Signal identity only while app initialization is pending. */
export default function AppBootGate() {
 useEffect(() => {
   if (!Capacitor.isNativePlatform()) return
   // Reveal the animated web launch only after it has painted beneath the native screen.
   let secondFrame = 0
   const firstFrame = requestAnimationFrame(() => {
     secondFrame = requestAnimationFrame(() => { void SplashScreen.hide().catch(() => {}) })
   })
   return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame) }
 }, [])
 return <div className="signal-launch" role="status" aria-busy="true" aria-label="Starting BestTake">
   <div className="signal-launch__brand"><SignalMark/><h1>BestTake</h1></div>
 </div>
}
