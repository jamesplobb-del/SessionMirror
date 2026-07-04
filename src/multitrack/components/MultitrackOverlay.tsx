import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronLeft, Sparkles } from 'lucide-react'
import type { Take } from '../../types'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import { triggerLightHaptic } from '../../utils/haptics'
import { shareTakeVideo } from '../../utils/shareTakeVideo'
import Pressable from '../../components/ui/Pressable'
import { useMultitrackSession } from '../state/useMultitrackSession'
import { useMultitrackSync } from '../synchronization/useMultitrackSync'
import { useMultitrackRecording } from '../recording/useMultitrackRecording'
import { buildMultitrackExportPlan, getPrimaryExportTake } from '../export/multitrackExport'
import MultitrackPanelGrid from './MultitrackPanelGrid'
import MultitrackToolbar from './MultitrackToolbar'
import MultitrackLayoutPicker from './MultitrackLayoutPicker'
import MultitrackTakePicker from '../takeVault/MultitrackTakePicker'
import MultitrackPracticeOverlay from '../practiceWidgets/MultitrackPracticeOverlay'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
import MultitrackRecordingStage from './MultitrackRecordingStage'

interface MultitrackOverlayProps {
  isOpen: boolean
  takes: Take[]
  streamRef: RefObject<MediaStream | null>
  tunerInstrument: TunerInstrument
  hapticFeedback: boolean
  isRecording: boolean
  onClose: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  onRecordingComplete: () => void
  pendingRecordingTakeId: string | null
  onClearPendingRecording: () => void
}

export default function MultitrackOverlay(props: MultitrackOverlayProps) {
  const { isOpen, takes, streamRef, tunerInstrument, hapticFeedback, isRecording, onClose, onStartRecording, onStopRecording, onRecordingComplete, pendingRecordingTakeId, onClearPendingRecording } = props
  const shellRef = useRef<HTMLDivElement>(null)
  const masterMediaRef = useRef<HTMLMediaElement | null>(null)
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const [takePickerPanelId, setTakePickerPanelId] = useState<string | null>(null)
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const { session, layout, setLayout, assignTakeToPanel, assignSheetMusic, updatePractice } = useMultitrackSession()
  const sync = useMultitrackSync()

  const recording = useMultitrackRecording({
    onCountInComplete: () => { onStartRecording() },
    onSyncPlaybackBeforeRecord: async () => { if (!sync.state.isPlaying) await sync.play() },
  })

  useEffect(() => {
    const targetPanelId = recording.targetPanelId ?? activePanelId
    if (!pendingRecordingTakeId || !targetPanelId) return
    const take = takes.find((t) => t.id === pendingRecordingTakeId)
    if (!take) return
    assignTakeToPanel(targetPanelId, take)
    onRecordingComplete()
    onClearPendingRecording()
    recording.cancel()
    setActivePanelId(null)
  }, [activePanelId, assignTakeToPanel, onClearPendingRecording, onRecordingComplete, pendingRecordingTakeId, recording, takes])

  const activePanel = session.panels.find((panel) => panel.id === activePanelId)

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div ref={shellRef} key="mt-overlay" className="multitrack-overlay" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={iosSpringSnappy} style={motionGpuLayer} role="dialog" aria-modal="true">
            <header className="multitrack-overlay__header">
              <Pressable type="button" intensity="soft" onClick={onClose}><ChevronLeft className="h-6 w-6" /></Pressable>
              <div><p className="text-xs font-semibold uppercase text-stone-400"><Sparkles className="inline h-3.5 w-3.5" /> Experimental</p><h1 className="text-lg font-semibold">Multitrack</h1></div>
            </header>
            <div className="multitrack-overlay__body">
              {showLayoutPicker && <MultitrackLayoutPicker activeLayoutId={session.layoutId} onSelectLayout={setLayout} />}
              {!session.sheetMusic.asset ? (
                <div className="multitrack-music-adder">
                  <SheetMusicPanel panel={session.sheetMusic} onAssetChange={(asset) => assignSheetMusic(session.sheetMusic.id, asset)} />
                </div>
              ) : null}
              <MultitrackPanelGrid layout={layout} panels={session.panels} sheetMusicPanel={session.sheetMusic} recordingTargetPanelId={recording.targetPanelId} recordingPhase={recording.phase}
                onTapPerformance={(id) => { triggerLightHaptic(hapticFeedback); setActivePanelId(id) }}
                onRemoveTake={(id) => assignTakeToPanel(id, null)} onSheetMusicChange={assignSheetMusic}
                onRegisterMedia={(id, el) => { sync.registerMedia(id, el); if (el && !masterMediaRef.current) masterMediaRef.current = el }} />
            </div>
            <MultitrackToolbar isPlaying={sync.state.isPlaying} currentTime={sync.state.currentTime} duration={sync.state.duration} practice={session.practice} showLayoutPicker={showLayoutPicker}
              onTogglePlay={() => void (sync.state.isPlaying ? sync.pause() : sync.play())} onRestart={() => void sync.restart()} onSeek={sync.seek}
              onToggleLayoutPicker={() => setShowLayoutPicker((v) => !v)} onToggleMetronome={() => updatePractice({ showMetronome: !session.practice.showMetronome })}
              onTogglePitch={() => updatePractice({ showPitch: !session.practice.showPitch })} onTogglePracticeOverlay={() => updatePractice({ practiceOverlayEnabled: !session.practice.practiceOverlayEnabled })}
              onExport={() => void (async () => { sync.pause(); const plan = buildMultitrackExportPlan(session, sync.state.duration); if (plan) await shareTakeVideo(getPrimaryExportTake(plan)) })()} />
            <MultitrackPracticeOverlay boundaryRef={shellRef} practice={session.practice} isPlaying={sync.state.isPlaying || isRecording} streamRef={streamRef} tunerInstrument={tunerInstrument} mediaRef={masterMediaRef} mediaKey="multitrack" onHideMetronome={() => updatePractice({ showMetronome: false })} onHidePitch={() => updatePractice({ showPitch: false })} />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {activePanel && isOpen && (
          <motion.div key="mt-recording-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MultitrackRecordingStage
              panelLabel={`Box ${session.panels.findIndex((panel) => panel.id === activePanel.id) + 1}`}
              streamRef={streamRef}
              tunerInstrument={tunerInstrument}
              practice={session.practice}
              phase={recording.phase}
              countInRemaining={recording.countInRemaining}
              isRecording={isRecording}
              onPracticeChange={updatePractice}
              onRecord={() => recording.beginCountIn(activePanel.id, session.practice)}
              onStop={() => { onStopRecording(); recording.cancel() }}
              onUseExisting={() => setTakePickerPanelId(activePanel.id)}
              onClose={() => {
                if (isRecording) onStopRecording()
                recording.cancel()
                setActivePanelId(null)
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <MultitrackTakePicker isOpen={takePickerPanelId !== null} takes={takes} onClose={() => setTakePickerPanelId(null)} onSelectTake={(take) => { if (takePickerPanelId) assignTakeToPanel(takePickerPanelId, take); setTakePickerPanelId(null); setActivePanelId(null) }} />
    </>, document.body)
}
