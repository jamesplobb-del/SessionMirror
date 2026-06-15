import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  ArrowLeft,
  Circle,
  Music2,
  Play,
  Square,
  Trash2,
  VolumeX,
} from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useAppSettings } from '../../hooks/useAppSettings'
import { getTrackDuration, useMultiTrackAudio } from './useMultiTrackAudio'
import StudioWaveformCanvas from './StudioWaveformCanvas'
import { initVaultDatabase, listProjects, saveTake, getTakesByProject } from '../../db'
import { initAppFilesystem } from '../../utils/filesystemInit'
import { persistUploadedVideo, resolveTakePlaybackUrl, NATIVE_AUDIO_MIME } from '../../utils/takeStorage'

const DraggablePitchWidget = lazy(() => import('../DraggablePitchWidget'))
const DraggableMetronomeWidget = lazy(() => import('../DraggableMetronomeWidget'))

interface StudioSandboxProps {
  onExit: () => void
}

const TRACK_LABELS = ['Lead', 'Harmony', 'Counter', 'Bass']
const TRACK_ACCENTS = [
  'rgba(56, 189, 248, 0.9)',
  'rgba(167, 139, 250, 0.9)',
  'rgba(52, 211, 153, 0.9)',
  'rgba(251, 191, 36, 0.9)',
]

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
    isPlaying,
    isMixingDown,
    error,
    micStreamRef,
    primeStudioAudio,
    startRecording,
    stopRecording,
    playAll,
    stopPlayback,
    toggleMute,
    toggleSolo,
    setTrackVolume,
    setTrackTrim,
    clearTrack,
    mixdown,
    shutdown,
  } = useMultiTrackAudio()

  useEffect(() => {
    void (async () => {
      await Promise.all([initVaultDatabase(), initAppFilesystem()])
      const projectList = await listProjects()
      setActiveProjectId(projectList[0]?.id ?? null)
    })()
  }, [])

  const handleExit = useCallback(() => {
    shutdown()
    onExit()
  }, [onExit, shutdown])

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

  const handleTransportPlay = useCallback(() => {
    handlePrimeInteraction()
    void playAll()
  }, [handlePrimeInteraction, playAll])

  const handleTransportStop = useCallback(() => {
    stopPlayback()
    if (recordingTrackId) {
      stopRecording()
    }
  }, [recordingTrackId, stopPlayback, stopRecording])

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

  const transportActive = isPlaying || Boolean(recordingTrackId)

  return (
    <div
      ref={shellRef}
      className="studio-daw fixed inset-0 z-[200] flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100"
      onPointerDown={handlePrimeInteraction}
    >
      {/* Header — safe area + widget zone */}
      <header className="studio-daw__header relative z-20 flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 pb-2 pt-[max(0.65rem,env(safe-area-inset-top))]">
        <Pressable
          type="button"
          intensity="soft"
          onClick={handleExit}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs font-semibold text-zinc-200"
          aria-label="Exit Studio Mode"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Standard
        </Pressable>

        <div className="flex min-w-0 items-center gap-2">
          <Music2 className="h-4 w-4 shrink-0 text-sky-300" aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-tight">Studio Sandbox</h1>
            <p className="truncate text-[10px] text-zinc-500">4-track overdub DAW</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <Pressable
            type="button"
            intensity="soft"
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              showPitch
                ? 'border border-sky-400/40 bg-sky-500/15 text-sky-100'
                : 'border border-white/10 bg-white/5 text-zinc-400'
            }`}
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
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
              settings.showMetronome
                ? 'border border-sky-400/40 bg-sky-500/15 text-sky-100'
                : 'border border-white/10 bg-white/5 text-zinc-400'
            }`}
            onClick={() => updateSettings({ showMetronome: !settings.showMetronome })}
          >
            Click
          </Pressable>
        </div>
      </header>

      {/* Floating widgets live in header zone */}
      <div className="pointer-events-none absolute inset-x-0 top-[max(3.25rem,calc(env(safe-area-inset-top)+2.75rem))] z-30 h-32">
        <div className="pitch-display-layer pointer-events-none h-full">
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
        <div className="metronome-display-layer pointer-events-none h-full">
          <Suspense fallback={null}>
            {settings.showMetronome && (
              <DraggableMetronomeWidget
                boundaryRef={shellRef}
                positionId="studio-metronome"
                isTakePlaying={transportActive}
                muteDuringPlayback={settings.muteMetronomeDuringPlayback}
              />
            )}
          </Suspense>
        </div>
      </div>

      {/* 4-track grid — no page scroll */}
      <main className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 py-2">
        {tracks.map((track, index) => {
          const isRecording = recordingTrackId === track.id
          const hasAudio = Boolean(track.audioBuffer)
          const duration = getTrackDuration(track)
          const trimEnd = track.trimEnd > 0 ? track.trimEnd : duration

          return (
            <section
              key={track.id}
              className={`studio-daw__track flex min-h-0 flex-1 overflow-hidden rounded-xl border ${
                isRecording
                  ? 'border-red-400/40 bg-red-500/5'
                  : 'border-white/8 bg-white/[0.03]'
              }`}
            >
              {/* Left control panel */}
              <div className="studio-daw__controls flex w-[7.25rem] shrink-0 flex-col gap-1.5 border-r border-white/8 p-2 sm:w-[8.5rem]">
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-zinc-200">
                    {TRACK_LABELS[index] ?? `Track ${index + 1}`}
                  </p>
                  <p className="text-[9px] text-zinc-500">
                    {isRecording ? 'Recording…' : hasAudio ? 'Ready' : 'Empty'}
                  </p>
                </div>

                <Pressable
                  type="button"
                  intensity="soft"
                  className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold ${
                    isRecording
                      ? 'border-red-400/50 bg-red-500/15 text-red-200'
                      : 'border-white/10 bg-white/5 text-zinc-200'
                  }`}
                  onClick={() => handleRecordToggle(track.id)}
                  disabled={Boolean(recordingTrackId && !isRecording)}
                >
                  <Circle className={`h-3 w-3 ${isRecording ? 'fill-red-400 text-red-400' : ''}`} />
                  {isRecording ? 'Stop' : 'Rec'}
                </Pressable>

                <div className="flex gap-1">
                  <Pressable
                    type="button"
                    intensity="soft"
                    className={`flex-1 rounded-lg border px-1 py-1 text-[9px] font-semibold ${
                      track.isMuted
                        ? 'border-orange-400/40 bg-orange-500/10 text-orange-200'
                        : 'border-white/10 bg-white/5 text-zinc-300'
                    }`}
                    onClick={() => toggleMute(track.id)}
                    disabled={Boolean(recordingTrackId)}
                    aria-label={track.isMuted ? 'Unmute' : 'Mute'}
                  >
                    {track.isMuted ? <VolumeX className="mx-auto h-3.5 w-3.5" /> : 'Mute'}
                  </Pressable>
                  <Pressable
                    type="button"
                    intensity="soft"
                    className={`flex-1 rounded-lg border px-1 py-1 text-[9px] font-semibold ${
                      track.isSolo
                        ? 'border-yellow-400/40 bg-yellow-500/10 text-yellow-100'
                        : 'border-white/10 bg-white/5 text-zinc-300'
                    }`}
                    onClick={() => toggleSolo(track.id)}
                    disabled={Boolean(recordingTrackId)}
                  >
                    Solo
                  </Pressable>
                </div>

                <label className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-medium text-zinc-500">Gain</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(track.volume * 100)}
                    disabled={!hasAudio || Boolean(recordingTrackId)}
                    className="studio-daw__slider h-1.5 w-full accent-sky-400"
                    onChange={(event) =>
                      setTrackVolume(track.id, Number(event.target.value) / 100)
                    }
                  />
                </label>

                <Pressable
                  type="button"
                  intensity="soft"
                  className="mt-auto inline-flex items-center justify-center rounded-lg border border-red-400/30 bg-red-500/10 p-1.5 text-red-200"
                  onClick={() => clearTrack(track.id)}
                  disabled={Boolean(recordingTrackId && isRecording)}
                  aria-label="Delete track"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Pressable>
              </div>

              {/* Right timeline / waveform */}
              <div className="min-w-0 flex-1 p-1.5">
                <StudioWaveformCanvas
                  audioBuffer={track.audioBuffer}
                  trimStart={track.trimStart}
                  trimEnd={trimEnd}
                  accentColor={TRACK_ACCENTS[index]}
                  onTrimChange={(start, end) => setTrackTrim(track.id, start, end)}
                />
              </div>
            </section>
          )
        })}
      </main>

      {/* Global transport bar */}
      <footer className="studio-daw__transport shrink-0 border-t border-white/10 bg-black/70 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
        {(error || mixdownStatus) && (
          <p
            className={`mb-2 text-center text-[10px] ${
              error ? 'text-red-300' : 'text-zinc-400'
            }`}
          >
            {error ?? mixdownStatus}
          </p>
        )}

        <div className="flex items-center justify-center gap-2">
          <Pressable
            type="button"
            intensity="soft"
            className="inline-flex min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-100"
            disabled={Boolean(recordingTrackId) || isPlaying}
            onClick={handleTransportPlay}
          >
            <Play className="h-4 w-4" />
            Play
          </Pressable>

          <Pressable
            type="button"
            intensity="soft"
            className="inline-flex min-w-[4.5rem] items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-zinc-100"
            disabled={!transportActive}
            onClick={handleTransportStop}
          >
            <Square className="h-4 w-4" />
            Stop
          </Pressable>

          <Pressable
            type="button"
            intensity="normal"
            className="inline-flex min-w-[8rem] flex-1 items-center justify-center rounded-full border border-sky-400/35 bg-sky-500/20 px-4 py-2 text-xs font-bold text-sky-50 sm:flex-none sm:min-w-[11rem]"
            disabled={isMixingDown || isSavingMixdown || Boolean(recordingTrackId)}
            onClick={() => void handleMixdownSave()}
          >
            {isMixingDown || isSavingMixdown ? 'Rendering…' : 'Mixdown & Save'}
          </Pressable>
        </div>
      </footer>

      <audio ref={liveMicPlaceholderRef as RefObject<HTMLAudioElement>} className="sr-only" />
    </div>
  )
}

export default StudioSandbox
