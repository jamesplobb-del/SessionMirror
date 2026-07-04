import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import type { AppSettings } from '../utils/appSettings'
import type { TunerInstrument } from '../utils/pitchConfig'
import { iosSpringSnappy, motionGpuLayer } from '../utils/motionPresets'
import { useMultitrackSession } from './useMultitrackSession'
import { DEFAULT_WIDGETS, type MultitrackWidgetVisibility } from './types'
import Pressable from '../components/ui/Pressable'
import YoutubeBenchmarkPlayer from '../components/YoutubeBenchmarkPlayer'
import MultitrackBackingPanel from './MultitrackBackingPanel'
import MultitrackWorkflow from './MultitrackWorkflow'
import MultitrackMixer from './MultitrackMixer'
import MultitrackPracticeWidgets from './MultitrackPracticeWidgets'
import '../styles/multitrack.css'

interface MultitrackOverlayProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  tunerInstrument: TunerInstrument
  streamRef: RefObject<MediaStream | null>
  onRequestMicStream: () => void
}

export default function MultitrackOverlay({
  isOpen,
  onClose,
  settings,
  tunerInstrument,
  streamRef,
  onRequestMicStream,
}: MultitrackOverlayProps) {
  const shellRef = useRef<HTMLDivElement>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null)
  const [youtubeHostEl, setYoutubeHostEl] = useState<HTMLElement | null>(null)
  const [widgets, setWidgets] = useState<MultitrackWidgetVisibility>(DEFAULT_WIDGETS)

  const session = useMultitrackSession({
    isOpen,
    micStreamRef: streamRef,
    youtubeIframeRef,
  })

  const updateWidgets = (patch: Partial<MultitrackWidgetVisibility>) => {
    setWidgets((prev) => ({ ...prev, ...patch }))
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="multitrack-overlay"
          ref={shellRef}
          className="multitrack-overlay"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={iosSpringSnappy}
          style={motionGpuLayer}
          role="dialog"
          aria-modal="true"
          aria-label="Shared Practice Environment"
        >
          <header className="multitrack-overlay__header safe-area-top">
            <div>
              <h1 className="multitrack-overlay__title">Shared Practice Environment</h1>
              <p className="multitrack-overlay__subtitle">Multitrack overdubs on one backing timeline</p>
            </div>
            <Pressable type="button" intensity="soft" onClick={onClose} aria-label="Close multitrack">
              <X size={22} />
            </Pressable>
          </header>

          <div className="multitrack-overlay__body">
            {session.error ? <p className="multitrack-overlay__error">{session.error}</p> : null}

            <MultitrackBackingPanel
              backing={session.backing}
              isPlaying={session.isPlaying}
              currentTime={session.currentTime}
              duration={session.duration}
              onImportMp3={(file) => void session.importMp3(file)}
              onSetYoutube={session.setYoutubeBacking}
              onPlay={() => void session.playAll()}
              onPause={session.pauseAll}
              onRestart={session.restartAll}
            />

            <MultitrackWorkflow
              boxes={session.boxes}
              isRecording={session.isRecording}
              hasBacking={Boolean(session.backing)}
              onStartRecord={() => {
                onRequestMicStream()
                void session.startRecordingBox()
              }}
              onStopRecord={() => void session.stopRecordingBox()}
              onRemoveBox={session.removeBox}
            />

            <MultitrackMixer levels={session.mixer} onChange={session.updateMixer} />

            <MultitrackPracticeWidgets
              boundaryRef={shellRef}
              settings={settings}
              tunerInstrument={tunerInstrument}
              micStreamRef={streamRef}
              backingMediaRef={session.backingRef}
              isPlaying={session.isPlaying}
              widgets={widgets}
              onWidgetsChange={updateWidgets}
              droneMixerLevel={session.mixer.drone}
            />
          </div>

          <audio ref={session.backingRef} className="sr-only" playsInline preload="metadata" />

          <div
            ref={(el) => setYoutubeHostEl(el)}
            className="multitrack-overlay__youtube-host"
            aria-hidden
          />

          {session.backing?.kind === 'youtube' && session.backing.youtubeUrl ? (
            <YoutubeBenchmarkPlayer
              embedUrl={session.backing.youtubeUrl}
              hostEl={youtubeHostEl}
              iframeRef={youtubeIframeRef}
            />
          ) : null}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
