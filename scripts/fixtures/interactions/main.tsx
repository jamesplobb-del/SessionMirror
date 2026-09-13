// Development-only harness: real menu/tab components, no recordings or mic.
import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import SettingsDrawer from '../../../src/components/SettingsDrawer'
import SettingsBranchWheel from '../../../src/components/SettingsBranchWheel'
import AudioPracticeTopTabs from '../../../src/components/audioPractice/AudioPracticeTopTabs'
import AudioMetronomeTab from '../../../src/components/audioPractice/AudioMetronomeTab'
import Pressable from '../../../src/components/ui/Pressable'
import { DEFAULT_APP_SETTINGS } from '../../../src/utils/appSettings'
import { pickHudQuickSettings } from '../../../src/utils/hudQuickSettings'
import { MetronomeProvider } from '../../../src/context/MetronomeContext'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import type { AudioPracticeTab } from '../../../src/types/audioPractice'
import '../../../src/index.css'
import '../../../src/styles/fresh-concept.css'
import '../../../src/styles/fresh-family.css'
import '../../../src/styles/vibrant-depth.css'
import '../../../src/styles/electric-refinement.css'
import '../../../src/styles/midnight-electric.css'
import '../../../src/styles/tablet.css'
import '../../../src/styles/interaction-polish.css'

document.documentElement.dataset.refinement = 'depth-electric'
document.documentElement.classList.add('app-audio-mode')
const dark = new URLSearchParams(location.search).has('dark')
document.documentElement.classList.toggle('app-dark-mode', dark)

function Preview() {
  const [tab, setTab] = useState<AudioPracticeTab>('audio')
  const [settings, setSettings] = useState({...DEFAULT_APP_SETTINGS, darkMode: dark})
  const [open, setOpen] = useState(false)
  const [workspace, setWorkspace] = useState(false)
  const [result, setResult] = useState('Ready')
  const anchor = useRef<HTMLButtonElement>(null)
  const update = (patch: Partial<typeof settings>) => {
    setSettings(s => ({...s, ...patch}))
    if (patch.darkMode !== undefined) document.documentElement.classList.toggle('app-dark-mode', patch.darkMode)
  }
  const checkSheet = () => {
    setOpen(true)
    // Inspect the browser's actual running animations after the entrance starts.
    // Block JS briefly to exercise the compositor path, never in production.
    setTimeout(() => {
      const animations = document.getAnimations().filter(a => a.effect instanceof KeyframeEffect)
      const slide = animations.some(a => {
        const effect = a.effect as KeyframeEffect
        return (effect.target as HTMLElement)?.classList.contains('animated-bottom-sheet') &&
          effect.getKeyframes().some(k => typeof k.transform === 'string' && k.transform.includes('translateY'))
      })
      const sheet = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Settings"]')
      const height = sheet?.getBoundingClientRect().height ?? 0
      const began = performance.now()
      while (performance.now() - began < 180) { /* deliberate stress */ }
      setResult(`${slide ? 'PASS' : 'FAIL'}: browser-managed sheet transform; height ${Math.round(height)}px. 180ms JS stall injected.`)
    }, 60)
  }
  return <ActionSheetProvider><MetronomeProvider><MotionConfig reducedMotion="user">
    <main className="app-ui-overlay--audio-mode" style={{maxWidth:430, height:'100dvh',margin:'auto',padding:16, color:dark?'#e9f4ff':'#172c45',background:dark?'#101e30':'#edf4fb'}}>
      <h1>Interaction checks</h1><p role="status">{result}</p>
      <AudioPracticeTopTabs activeTab={tab} onTabChange={setTab}/>
      <p>Selected: {tab}</p>
      <div style={{display:'flex',gap:12,margin:'20px 0'}}>
        <Pressable onClick={()=>setOpen(true)}>Settings</Pressable>
        <Pressable onClick={checkSheet}>Check sheet under load</Pressable>
      </div>
      {tab === 'metronome' && <AudioMetronomeTab/>}
      <Pressable ref={anchor} style={{position:'fixed',bottom:50,left:'45%'}} onClick={()=>setWorkspace(v=>!v)}>Workspace</Pressable>
    </main>
    <SettingsDrawer isOpen={open} onClose={()=>setOpen(false)} settings={settings} hudQuickSettings={pickHudQuickSettings(settings)} onUpdate={update} onAudioEnhancerChange={audioEnhancerEnabled=>update({audioEnhancerEnabled})} onReset={()=>setSettings(DEFAULT_APP_SETTINGS)}/>
    <SettingsBranchWheel open={workspace} onClose={()=>setWorkspace(false)} anchorRef={anchor} layoutMode="audio" pitchTrackerEnabled={settings.pitchTrackerEnabled} showTakeCards={settings.showTakeCards} showMetronome={settings.showMetronome} audioEnhancerEnabled={settings.audioEnhancerEnabled} pitchToggleVisible onPitchTrackerChange={pitchTrackerEnabled=>update({pitchTrackerEnabled})} onShowTakeCardsChange={showTakeCards=>update({showTakeCards})} onShowMetronomeChange={showMetronome=>update({showMetronome})} onAudioEnhancerChange={audioEnhancerEnabled=>update({audioEnhancerEnabled})}/>
  </MotionConfig></MetronomeProvider></ActionSheetProvider>
}
createRoot(document.getElementById('root')!).render(<Preview/> )
