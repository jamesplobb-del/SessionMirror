import { useCallback, useEffect, useRef } from 'react'
import { ArrowLeft, Play, Square, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { mobileVideoProps } from '../../utils/mobileVideo'
import { useMultiTrackStudio, type StudioTrack } from './useMultiTrackStudio'

interface StudioSandboxProps {
  onExit: () => void
}

const CIRCLE_BTN =
  'flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-sm transition active:scale-90'

function TrackBox({
  track,
  setVideoRef,
  onAction,
  onClear,
  onEnded,
}: {
  track: StudioTrack
  setVideoRef: (index: number, el: HTMLVideoElement | null) => void
  onAction: () => void
  onClear: () => void
  onEnded: () => void
}) {
  const index = track.id - 1
  const videoElRef = useRef<HTMLVideoElement | null>(null)

  const bindRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoElRef.current = el
      setVideoRef(index, el)
    },
    [index, setVideoRef],
  )

  // Single source of truth for srcObject / src on this box's <video>
  useEffect(() => {
    const el = videoElRef.current
    if (!el) return

    if (track.status === 'RECORDING' && track.stream) {
      if (el.srcObject !== track.stream) {
        el.srcObject = track.stream
        el.removeAttribute('src')
      }
      void el.play().catch(() => {})
      return
    }

    if (track.recordedUrl) {
      if (el.srcObject) el.srcObject = null
      if (el.src !== track.recordedUrl) {
        el.src = track.recordedUrl
        el.load()
      }

      if (track.status === 'PLAYING') {
        el.currentTime = 0
        void el.play().catch(() => {})
      }
      return
    }

    // Cleared / empty — reset element without unmounting
    if (el.srcObject) el.srcObject = null
    el.removeAttribute('src')
    el.load()
  }, [track.stream, track.recordedUrl, track.status])

  useEffect(() => {
    const el = videoElRef.current
    if (!el) return
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [onEnded])

  const showStop = track.status === 'RECORDING' || track.status === 'PLAYING'
  const showPlay = track.status === 'IDLE' && !!track.recordedUrl
  const showRecord = track.status === 'IDLE' && !track.recordedUrl

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden border border-white/15 bg-stone-900">
      <video
        ref={bindRef}
        playsInline
        muted={track.status === 'RECORDING'}
        {...mobileVideoProps}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Track number */}
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/80">
        {track.id}
      </span>

      {/* Retake — top-right, only when a take exists and not actively recording */}
      {track.recordedUrl && track.status !== 'RECORDING' && (
        <button
          type="button"
          aria-label={`Clear track ${track.id}`}
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className={`absolute right-2 top-2 z-10 ${CIRCLE_BTN} h-7 w-7 border-white/15 bg-black/70`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Per-box transport — bottom-right icon button */}
      <button
        type="button"
        aria-label={
          showStop ? 'Stop' : showPlay ? 'Play track' : 'Record track'
        }
        onClick={onAction}
        className={`absolute bottom-2 right-2 z-10 ${CIRCLE_BTN} ${
          showRecord ? 'border-red-400/50 bg-red-500/80' : ''
        }`}
      >
        {showStop && <Square className="h-3.5 w-3.5 fill-white" />}
        {showPlay && <Play className="h-3.5 w-3.5 fill-white" style={{ marginLeft: 1 }} />}
        {showRecord && <span className="h-3 w-3 rounded-full bg-white" />}
      </button>
    </div>
  )
}

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  const {
    tracks,
    setVideoRef,
    isGlobalPlaying,
    hasAnyRecording,
    isAnyRecording,
    startRecording,
    stopRecording,
    playTrack,
    pauseTrack,
    playAll,
    stopAll,
    clearTrack,
  } = useMultiTrackStudio()

  const handleAction = useCallback(
    (track: StudioTrack) => {
      if (track.status === 'RECORDING') {
        stopRecording(track.id)
        return
      }
      if (track.status === 'PLAYING') {
        pauseTrack(track.id)
        return
      }
      if (track.recordedUrl) {
        playTrack(track.id)
        return
      }
      void startRecording(track.id)
    },
    [pauseTrack, playTrack, startRecording, stopRecording],
  )

  const handleGlobalPlayStop = useCallback(() => {
    if (isGlobalPlaying) stopAll()
    else playAll()
  }, [isGlobalPlaying, playAll, stopAll])

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex shrink-0 justify-start px-3 py-2">
        <Pressable
          intensity="soft"
          onClick={onExit}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 active:scale-95"
          aria-label="Exit Studio"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Exit
        </Pressable>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-3 pb-2">
        <div className="grid aspect-square h-full max-h-[65vh] w-full max-w-2xl grid-cols-2 grid-rows-2 gap-2">
          {tracks.map((track) => (
            <TrackBox
              key={track.id}
              track={track}
              setVideoRef={setVideoRef}
              onAction={() => handleAction(track)}
              onClear={() => clearTrack(track.id)}
              onEnded={() => pauseTrack(track.id)}
            />
          ))}
        </div>
      </div>

      {/* Global transport — native play/pause only, no track status changes */}
      <div
        className="flex shrink-0 justify-center px-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          aria-label={isGlobalPlaying ? 'Stop all tracks' : 'Play all tracks'}
          onClick={handleGlobalPlayStop}
          disabled={!hasAnyRecording || isAnyRecording}
          className="flex items-center gap-2.5 rounded-full border border-white/15 bg-white/8 px-6 py-3 text-sm font-semibold text-white/85 shadow-[0_4px_24px_rgba(0,0,0,0.45)] backdrop-blur-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {isGlobalPlaying ? (
            <>
              <Square className="h-4 w-4 fill-white" />
              Stop All
            </>
          ) : (
            <>
              <Play className="h-4 w-4 fill-white" style={{ marginLeft: 1 }} />
              Play All
            </>
          )}
        </button>
      </div>
    </div>
  )
}
