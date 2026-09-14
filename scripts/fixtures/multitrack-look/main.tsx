import { createRoot } from 'react-dom/client'
import { useRef } from 'react'
import { ActionSheetProvider } from '../../../src/context/ActionSheetContext'
import MultitrackOverlay from '../../../src/multitrack/components/MultitrackOverlay'
import '../../../src/index.css'
import '../../../src/styles/interaction-polish.css'
// Isolated browser fixture; use its dedicated review origin, never the live app's storage.
document.documentElement.dataset.refinement = 'depth-electric'
const takes: [] = []
const noop = () => {}
function Review() {
  const streamRef = useRef<MediaStream | null>(null)
  return <ActionSheetProvider><MultitrackOverlay isOpen takesLoaded takes={takes} streamRef={streamRef} streamGeneration={0} tunerInstrument="winds" hapticFeedback={false} isRecording={false} isStopping={false} elapsed={0} onClose={noop} onStartRecording={async () => false} onStopRecording={noop} onRecordingComplete={noop} onDeleteTakes={noop} pendingRecordingTakeId={null} onClearPendingRecording={noop} onSaveRenderedTakeToVault={async () => {}} /></ActionSheetProvider>
}
createRoot(document.getElementById('root')!).render(<Review />)
