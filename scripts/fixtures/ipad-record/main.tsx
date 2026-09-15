import React, { useRef } from 'react'
import { createRoot } from 'react-dom/client'
import AudioModeHome from '../../../src/components/audioPractice/AudioModeHome'
import { AudioModePlaybackProvider } from '../../../src/context/AudioModePlaybackContext'
import '../../../src/index.css'
import '../../../src/styles/tablet.css'
function Preview() {
  const stream = useRef<MediaStream | null>(null)
  return <AudioModePlaybackProvider><div className="app-ui-overlay app-ui-overlay--audio-mode app-ui-overlay--audio-practice-record" style={{height:'100dvh', padding:'32px', display:'flex'}}>
    <AudioModeHome isRecording elapsed={12} ready={false} streamRef={stream} streamGeneration={0} challengerTake={null} benchmarkTake={null} libraryBenchmarkPlayback={null} hapticFeedback={false}/>
  </div></AudioModePlaybackProvider>
}
createRoot(document.getElementById('root')!).render(<Preview />)
