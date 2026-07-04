import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronLeft, Sparkles } from 'lucide-react'
import type { Take } from '../../types'
import type { TunerInstrument } from '../../utils/pitchConfig'
import { iosSpringSnappy, motionGpuLayer } from '../../utils/motionPresets'
import { triggerLightHaptic } from '../../utils/haptics'
import { shareTakeVideo } from '../../utils/shareTakeVideo'
import { playTakeMediaAudible, primeTakePlaybackAudioSync } from '../../utils/takePlaybackAudio'
import { routeTakePlaybackToSpeaker } from '../../utils/takePlaybackSpeaker'
import {
  pauseYoutubeProxy,
  seekYoutubeProxy,
  setYoutubeProxyVolumeFromUi,
  startYoutubeProxyPlayback,
  wakeYoutubeReference,
} from '../../utils/playalong/youtubeBridge'
import Pressable from '../../components/ui/Pressable'
import { useMultitrackSession } from '../state/useMultitrackSession'
import { useMultitrackSync } from '../synchronization/useMultitrackSync'
import { useMultitrackRecording } from '../recording/useMultitrackRecording'
import { buildMultitrackExportPlan, getPrimaryExportTake } from '../export/multitrackExport'
import MultitrackPanelGrid from './MultitrackPanelGrid'
import MultitrackToolbar from './MultitrackToolbar'
import MultitrackLayoutPicker from './MultitrackLayoutPicker'
import MultitrackTakePicker from '../takeVault/MultitrackTakePicker'
import SheetMusicPanel from '../sheetMusic/SheetMusicPanel'
import MultitrackRecordingStage from './MultitrackRecordingStage'
import MultitrackBackingTrackPanel from '../backing/MultitrackBackingTrackPanel'

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
  const backingAudioRef = useRef<HTMLAudioElement>(null)
  const backingYoutubeIframeRef = useRef<HTMLIFrameElement>(null)
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const [takePickerPanelId, setTakePickerPanelId] = useState<string | null>(null)
  const [activePanelId, setActivePanelId] = useState<string | null>(null)
  const [backingPlaying, setBackingPlaying] = useState(false)
  const { session, layout, setLayout, assignTakeToPanel, assignSheetMusic, updatePractice, updateBacking } = useMultitrackSession()
  const sync = useMultitrackSync()

  const pauseBacking = useCallback(() => {
    const backing = session.backing
    if (backing.kind === 'audio') {
      backingAudioRef.current?.pause()
    } else if (backing.kind === 'youtube') {
      pauseYoutubeProxy(backingYoutubeIframeRef.current)
    }
    setBackingPlaying(false)
  }, [session.backing])

  const prepareBackingForRecord = useCallback(() => {
    const backing = session.backing
    if (backing.kind === 'audio') {
      const audio = backingAudioRef.current
      if (!audio) return
      audio.volume = backing.volume
      audio.muted = false
      audio.preload = 'auto'
      routeTakePlaybackToSpeaker(audio, backing.volume, false)
      primeTakePlaybackAudioSync(audio)
    } else if (backing.kind === 'youtube') {
      const iframe = backingYoutubeIframeRef.current
      setYoutubeProxyVolumeFromUi(iframe, backing.volume)
      wakeYoutubeReference(iframe, { attemptPlay: false, uiVolume: backing.volume })
    }
  }, [session.backing])

  const playBackingFromStart = useCallback(async () => {
    const backing = session.backing
    if (backing.kind === 'none') return false

    if (backing.kind === 'audio') {
      const audio = backingAudioRef.current
      if (!audio) return false
      audio.volume = backing.volume
      audio.muted = false
      audio.preload = 'auto'
      routeTakePlaybackToSpeaker(audio, backing.volume, false)
      try {
        audio.currentTime = 0
      } catch {
        /* media may still be loading */
      }
      const started = await playTakeMediaAudible(audio)
      setBackingPlaying(started)
      return started
    }

    const iframe = backingYoutubeIframeRef.current
    seekYoutubeProxy(iframe, 0)
    startYoutubeProxyPlayback(iframe, backing.volume)
    setBackingPlaying(true)
    return true
  }, [session.backing])

  const toggleBackingPlayback = useCallback(() => {
    if (backingPlaying) {
      pauseBacking()
      return
    }
    void playBackingFromStart()
  }, [backingPlaying, pauseBacking, playBackingFromStart])

  const recording = useMultitrackRecording({
    onCountInComplete: () => { onStartRecording() },
    onSyncPlaybackBeforeRecord: async () => {
      if (!sync.state.isPlaying) await sync.play()
      await playBackingFromStart()
    },
  })

  useEffect(() => {
    if (!isOpen) pauseBacking()
  }, [isOpen, pauseBacking])

  useEffect(() => {
    if (session.backing.kind === 'none') pauseBacking()
  }, [pauseBacking, session.backing.kind])

  useEffect(() => {
    const targetPanelId = recording.targetPanelId ?? activePanelId
    if (!pendingRecordingTakeId || !targetPanelId) return
    const take = takes.find((t) => t.id === pendingRecordingTakeId)
    if (!take) return
    assignTakeToPanel(targetPanelId, take)
    onRecordingComplete()
    onClearPendingRecording()
    recording.cancel()
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
              <MultitrackBackingTrackPanel
                backing={session.backing}
                audioRef={backingAudioRef}
                youtubeIframeRef={backingYoutubeIframeRef}
                isPlaying={backingPlaying}
                onBackingChange={(backing) => {
                  pauseBacking()
                  updateBacking(backing)
                }}
                onTogglePlayback={toggleBackingPlayback}
              />
              <MultitrackPanelGrid layout={layout} panels={session.panels} sheetMusicPanel={session.sheetMusic} recordingTargetPanelId={recording.targetPanelId} recordingPhase={recording.phase}
                onTapPerformance={(id) => { triggerLightHaptic(hapticFeedback); setActivePanelId(id) }}
                onRemoveTake={(id) => assignTakeToPanel(id, null)} onSheetMusicChange={assignSheetMusic}
                onRegisterMedia={(id, el) => { sync.registerMedia(id, el); if (el && !masterMediaRef.current) masterMediaRef.current = el }} />
            </div>
            <MultitrackToolbar isPlaying={sync.state.isPlaying || backingPlaying} currentTime={sync.state.currentTime} duration={sync.state.duration} showLayoutPicker={showLayoutPicker}
              onTogglePlay={() => void (async () => {
                if (sync.state.isPlaying || backingPlaying) {
                  sync.pause()
                  pauseBacking()
                  return
                }
                await sync.play()
                await playBackingFromStart()
              })()} onRestart={() => void (async () => { sync.pause(); pauseBacking(); await sync.restart(); await playBackingFromStart() })()} onSeek={sync.seek}
              onToggleLayoutPicker={() => setShowLayoutPicker((v) => !v)}
              onExport={() => void (async () => { sync.pause(); pauseBacking(); const plan = buildMultitrackExportPlan(session, sync.state.duration); if (plan) await shareTakeVideo(getPrimaryExportTake(plan)) })()} />
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
              reviewTake={activePanel.kind === 'performance' ? activePanel.take : null}
              onPracticeChange={updatePractice}
              onRecord={() => {
                prepareBackingForRecord()
                recording.beginCountIn(activePanel.id, session.practice)
              }}
              onStop={() => { sync.pause(); pauseBacking(); onStopRecording(); recording.cancel() }}
              onUseExisting={() => setTakePickerPanelId(activePanel.id)}
              onClose={() => {
                if (isRecording) onStopRecording()
                sync.pause()
                pauseBacking()
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
