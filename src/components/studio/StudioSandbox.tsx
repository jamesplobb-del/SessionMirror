import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { ArrowLeft, Circle, Mic, Music2, Play, Square, Trash2, Volume2, VolumeX } from 'lucide-react'
import { motion } from 'framer-motion'
import Pressable from '../ui/Pressable'
import { useAppSettings } from '../../hooks/useAppSettings'
import { useMultiTrackAudio } from './useMultiTrackAudio'
import { initVaultDatabase, listProjects, saveTake, getTakesByProject } from '../../db'
import { initAppFilesystem } from '../../utils/filesystemInit'
import { persistUploadedVideo, resolveTakePlaybackUrl, NATIVE_AUDIO_MIME } from '../../utils/takeStorage'
import { iosSpringSnappy } from '../../utils/motionPresets'

const DraggablePitchWidget = lazy(() => import('../DraggablePitchWidget'))
const DraggableMetronomeWidget = lazy(() => import('../DraggableMetronomeWidget'))

interface StudioSandboxProps {
  onExit: () => void
}

const TRACK_LABELS = ['Lead', 'Harmony', 'Counter', 'Bass']

function StudioSandbox({ onExit }: StudioSandboxProps) {
  const { settings, updateSettings } = useAppSettings()
  const shellRef = useRef<HTMLDivElement>(null)
  const liveMicPlaceholderRef = useRef<HTMLMediaElement>(null)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [showPitch, setShowPitch] = useState(settings.pitchTrackerEnabled)
  const [mixdownStatus, setMixdownStatus] = useState<string | null>(null)
  const [isSavingMixdown, setIsSavingMixdown] = useState(false)

  const {
    tracks,
    recordingTrackId,
    playingTrackId,
    isMixingDown,
    error,
    micStreamRef,
    primeStudioAudio,
    startRecording,
    stopRecording,
    playTrack,
    stopPlayback,
    toggleMute,
    toggleSolo,
    clearTrack,
    mixdown,
  } = useMultiTrackAudio()

  useEffect(() => {
    void (async () => {
      await Promise.all([initVaultDatabase(), initAppFilesystem()])
      const projectList = await listProjects()
      setActiveProjectId(projectList[0]?.id ?? null)
    })()
  }, [])

  const handlePrimeInteraction = useCallback(() => {
    void primeStudioAudio()
  }, [primeStudioAudio])

  const handleRecordToggle = useCallback(
    (trackId: string) => {
      handlePrimeInteraction()
      if (recordingTrackId === trackId) {
        stopRecording()
        return
      }
      if (recordingTrackId) return
      void startRecording(trackId)
    },
    [handlePrimeInteraction, recordingTrackId, startRecording, stopRecording],
  )

  const handlePlayToggle = useCallback(
    (trackId: string) => {
      handlePrimeInteraction()
      if (playingTrackId === trackId) {
        stopPlayback()
        return
      }
      void playTrack(trackId)
    },
    [handlePrimeInteraction, playTrack, playingTrackId, stopPlayback],
  )

  const handleMixdownSave = useCallback(async () => {
    handlePrimeInteraction()
    if (!activeProjectId) {
      setMixdownStatus('Create a project in Standard Mode first.')
      return
    }

    setIsSavingMixdown(true)
    setMixdownStatus(null)

    try {
      const result = await mixdown()
      if (!result) {
        setMixdownStatus('Record at least one unmuted track before mixing down.')
        return
      }

      const takeId = crypto.randomUUID()
      const persisted = await persistUploadedVideo(result.blob, takeId, 'audio/wav')
      if (!persisted.filePath) {
        setMixdownStatus('Mixdown rendered. Save to vault requires the native app build.')
        return
      }

      await resolveTakePlaybackUrl(persisted.filePath, persisted.videoUrl)

      const existing = await getTakesByProject(activeProjectId)
      const takeIndex = existing.length + 1

      await saveTake({
        projectId: activeProjectId,
        filePath: persisted.filePath,
        duration: result.durationSeconds,
        takeId,
        mimeType: NATIVE_AUDIO_MIME,
        mediaType: 'audio',
        name: `Studio Mix ${takeIndex}`,
      })

      setMixdownStatus(`Saved "Studio Mix ${takeIndex}" to the vault.`)
    } catch {
      setMixdownStatus('Mixdown save failed. Try again.')
    } finally {
      setIsSavingMixdown(false)
    }
  }, [activeProjectId, handlePrimeInteraction, mixdown])

  const takePlaybackActive = Boolean(playingTrackId || recordingTrackId)

  return (
    <div
      ref={shellRef}
      className="studio-sandbox app-shell"
      onPointerDown={handlePrimeInteraction}
    >
      <header className="studio-sandbox__header">
        <Pressable
          type="button"
          intensity="soft"
          onClick={onExit}
          className="studio-sandbox__back"
          aria-label="Exit Studio Mode"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Standard</span>
        </Pressable>

        <div className="studio-sandbox__title-block">
          <Music2 className="h-5 w-5 text-sky-300" aria-hidden />
          <div>
            <h1 className="studio-sandbox__title">Studio Sandbox</h1>
            <p className="studio-sandbox__subtitle">Multi-track overdub workspace</p>
          </div>
        </div>

        <div className="studio-sandbox__header-tools">
          <Pressable
            type="button"
            intensity="soft"
            className={`studio-sandbox__tool ${showPitch ? 'studio-sandbox__tool--active' : ''}`}
            onClick={() => {
              const next = !showPitch
              setShowPitch(next)
              updateSettings({ pitchTrackerEnabled: next })
            }}
          >
            Tuner
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            className={`studio-sandbox__tool ${settings.showMetronome ? 'studio-sandbox__tool--active' : ''}`}
            onClick={() => updateSettings({ showMetronome: !settings.showMetronome })}
          >
            Click
          </Pressable>
        </div>
      </header>

      <div className="studio-sandbox__grid">
        {tracks.map((track, index) => {
          const isRecording = recordingTrackId === track.id
          const isPlaying = playingTrackId === track.id
          const hasTake = Boolean(track.blob)

          return (
            <motion.section
              key={track.id}
              layout
              className={`studio-track ${isRecording ? 'studio-track--recording' : ''}`}
              transition={iosSpringSnappy}
            >
              <div className="studio-track__meta">
                <span className="studio-track__index">{index + 1}</span>
                <div>
                  <p className="studio-track__label">{TRACK_LABELS[index] ?? `Track ${index + 1}`}</p>
                  <p className="studio-track__status">
                    {isRecording
                      ? 'Recording…'
                      : hasTake
                        ? 'Ready'
                        : 'Empty'}
                  </p>
                </div>
              </div>

              <div className="studio-track__wave" aria-hidden>
                {hasTake ? (
                  <div className={`studio-track__wave-fill ${isPlaying ? 'studio-track__wave-fill--live' : ''}`} />
                ) : (
                  <Mic className="h-5 w-5 text-stone-600" />
                )}
              </div>

              <div className="studio-track__controls">
                <Pressable
                  type="button"
                  intensity="soft"
                  className={`studio-track__btn studio-track__btn--record ${isRecording ? 'studio-track__btn--active' : ''}`}
                  onClick={() => handleRecordToggle(track.id)}
                  disabled={Boolean(recordingTrackId && !isRecording)}
                  aria-label={isRecording ? 'Stop recording track' : 'Record track'}
                >
                  <Circle className={`h-4 w-4 ${isRecording ? 'fill-red-400 text-red-400' : ''}`} />
                  <span>{isRecording ? 'Stop' : 'Rec'}</span>
                </Pressable>

                <Pressable
                  type="button"
                  intensity="soft"
                  className={`studio-track__btn ${isPlaying ? 'studio-track__btn--active' : ''}`}
                  onClick={() => handlePlayToggle(track.id)}
                  disabled={!hasTake || Boolean(recordingTrackId)}
                  aria-label={isPlaying ? 'Stop track playback' : 'Play track'}
                >
                  {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span>{isPlaying ? 'Stop' : 'Play'}</span>
                </Pressable>

                <Pressable
                  type="button"
                  intensity="soft"
                  className={`studio-track__btn ${track.isMuted ? 'studio-track__btn--warn' : ''}`}
                  onClick={() => toggleMute(track.id)}
                  disabled={Boolean(recordingTrackId)}
                  aria-label={track.isMuted ? 'Unmute track' : 'Mute track'}
                >
                  {track.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  <span>Mute</span>
                </Pressable>

                <Pressable
                  type="button"
                  intensity="soft"
                  className={`studio-track__btn ${track.isSolo ? 'studio-track__btn--solo' : ''}`}
                  onClick={() => toggleSolo(track.id)}
                  disabled={Boolean(recordingTrackId)}
                  aria-label={track.isSolo ? 'Unsolo track' : 'Solo track'}
                >
                  <span>Solo</span>
                </Pressable>

                <Pressable
                  type="button"
                  intensity="soft"
                  className="studio-track__btn studio-track__btn--danger"
                  onClick={() => clearTrack(track.id)}
                  disabled={Boolean(recordingTrackId && recordingTrackId === track.id)}
                  aria-label="Clear track"
                >
                  <Trash2 className="h-4 w-4" />
                </Pressable>
              </div>
            </motion.section>
          )
        })}
      </div>

      <footer className="studio-sandbox__footer">
        {(error || mixdownStatus) && (
          <p className={`studio-sandbox__message ${error ? 'studio-sandbox__message--error' : ''}`}>
            {error ?? mixdownStatus}
          </p>
        )}

        <Pressable
          type="button"
          intensity="normal"
          className="studio-sandbox__mixdown"
          disabled={isMixingDown || isSavingMixdown || Boolean(recordingTrackId)}
          onClick={() => void handleMixdownSave()}
        >
          {isMixingDown || isSavingMixdown ? 'Rendering mix…' : 'Mixdown & Save to Vault'}
        </Pressable>
      </footer>

      <div className="pitch-display-layer">
        <Suspense fallback={null}>
          {showPitch && (
            <DraggablePitchWidget
              boundaryRef={shellRef}
              mediaRef={liveMicPlaceholderRef}
              enabled={showPitch}
              isPlaying
              mediaKey="studio-live-mic"
              label="Studio Tuner"
              isAudioMode
              liveMicEnabled
              micStreamRef={micStreamRef as RefObject<MediaStream | null>}
              layoutRegion="main"
              liveMicOnly
              tunerInstrument={settings.tunerInstrument}
              positionId="studio-pitch"
            />
          )}
        </Suspense>
      </div>

      <div className="metronome-display-layer">
        <Suspense fallback={null}>
          {settings.showMetronome && (
            <DraggableMetronomeWidget
              boundaryRef={shellRef}
              positionId="studio-metronome"
              isTakePlaying={takePlaybackActive}
              muteDuringPlayback={settings.muteMetronomeDuringPlayback}
            />
          )}
        </Suspense>
      </div>

      <audio ref={liveMicPlaceholderRef as RefObject<HTMLAudioElement>} className="sr-only" />
    </div>
  )
}

export default StudioSandbox
