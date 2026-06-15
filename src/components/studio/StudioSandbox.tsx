import { useCallback, useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { mobileVideoProps } from '../../utils/mobileVideo'
import { useMultiTrackStudio, type StudioTrack } from './useMultiTrackStudio'

interface StudioSandboxProps {
  onExit: () => void
}

function buttonLabel(track: StudioTrack): string {
  if (track.status === 'RECORDING') return 'Stop'
  if (track.status === 'PLAYING') return 'Stop'
  if (track.recordedUrl) return 'Play'
  return 'Record'
}

function TrackBox({
  track,
  setVideoRef,
  onAction,
  onEnded,
}: {
  track: StudioTrack
  setVideoRef: (index: number, el: HTMLVideoElement | null) => void
  onAction: () => void
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
    }
  }, [track.stream, track.recordedUrl, track.status])

  useEffect(() => {
    const el = videoElRef.current
    if (!el) return
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [onEnded])

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden border border-white/15 bg-stone-900">
      <video
        ref={bindRef}
        playsInline
        muted={track.status === 'RECORDING'}
        {...mobileVideoProps}
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div className="absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-black/70 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white backdrop-blur-sm active:scale-95"
        >
          {buttonLabel(track)}
        </button>
      </div>

      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/80">
        {track.id}
      </span>
    </div>
  )
}

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  const { tracks, setVideoRef, startRecording, stopRecording, playTrack, pauseTrack } =
    useMultiTrackStudio()

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

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col bg-black text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
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

      <div className="flex min-h-0 flex-1 items-center justify-center p-3">
        <div className="grid aspect-square h-full max-h-[70vh] w-full max-w-2xl grid-cols-2 grid-rows-2 gap-2">
          {tracks.map((track) => (
            <TrackBox
              key={track.id}
              track={track}
              setVideoRef={setVideoRef}
              onAction={() => handleAction(track)}
              onEnded={() => pauseTrack(track.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
