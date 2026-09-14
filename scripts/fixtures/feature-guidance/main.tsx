import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import FeatureGuidance from '../../../src/components/FeatureGuidance'
import { confirmFeatureAction, reportFeatureAction, resetFeatureGuides, setFeatureTipsEnabled } from '../../../src/utils/featureGuidance'
import './preview.css'
function Preview() {
  const [workspace, setWorkspace] = useState(false)
  const [take, setTake] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [recording, setRecording] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [dark, setDark] = useState(false)
  const [tool, setTool] = useState(false)
  return <main>
    <header><h1>BestTake</h1><p>Feature guidance review</p></header>
    <div className="preview-options">
      <button onClick={resetFeatureGuides}>Reset guides</button>
      <button onClick={() => setFeatureTipsEnabled(false)}>Turn tips off</button>
      <button onClick={() => { setDark(!dark); document.documentElement.classList.toggle('app-dark-mode', !dark) }}>Appearance</button>
      <button onClick={() => { setPlaying(!playing) }}>{playing ? 'Stop playback' : 'Play back'}</button>
      <button onClick={() => confirmFeatureAction('Routine updated')}>Update routine</button>
    </div>
    <div className="preview-takes">
      <section data-tutorial="best-take-box"><h2>Best Take</h2><p>{pinned ? 'Take 1' : 'Keep a take here'}</p></section>
      {take && <section><h2>Current Take</h2><p>Take 1</p>{!pinned && <button data-tutorial="pin-current-as-best" onClick={() => {
        setPinned(true); reportFeatureAction('current-take-pinned'); reportFeatureAction('best-take-pinned')
      }}>Pin as Best Take</button>}</section>}
    </div>
    <div className="preview-center">{recording ? 'Recording' : playing ? 'Playing back' : handsFree ? 'Your turn' : 'Ready to record'}</div>
    <footer>
      {workspace && <section className="preview-workspace"><h2>Workspace</h2><div data-guidance="workspace-tools" className="preview-tools">
        <button onClick={() => { setTool(!tool); reportFeatureAction('branch-widget-selected'); confirmFeatureAction('Workspace updated') }}>{tool ? 'Hide metronome' : 'Show metronome'}</button>
        <button onClick={() => { setHandsFree(!handsFree); reportFeatureAction(handsFree ? 'hands-free-disabled' : 'hands-free-enabled') }}>Hands-free {handsFree ? 'off' : 'on'}</button>
      </div></section>}
      <div className="preview-controls">
        <button onClick={() => { setWorkspace(!workspace); reportFeatureAction(workspace ? 'overlays-closed' : 'overlays-opened') }}>{workspace ? 'Close Workspace' : 'Workspace'}</button>
        <button data-tutorial="record-controls" onClick={() => {
          setRecording(!recording)
          if (recording) { setTake(true); reportFeatureAction('take-saved') }
        }}>{recording ? 'Stop recording' : 'Record'}</button>
        <button onClick={() => { setHandsFree(!handsFree); reportFeatureAction(handsFree ? 'hands-free-disabled' : 'hands-free-enabled') }}>Hands-free</button>
      </div>
    </footer>
    <FeatureGuidance paused={recording || playing} feedbackPaused={recording || playing} workspaceOpen={workspace} handsFreeEnabled={handsFree} isRecording={recording} />
  </main>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>)
