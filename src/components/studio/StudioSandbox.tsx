import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import { ArrowLeft, Play, Square, Volume2, VolumeX, X } from 'lucide-react'
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
  slotIndex,
  videoRefs,
  countdownValue,
  isCountingDownHere,
  onAction,
  onClear,
  onToggleMute,
  onEnded,
}: {
  track: StudioTrack
  slotIndex: number
  videoRefs: MutableRefObject<(HTMLVideoElement | null)[]>
  countdownValue: number
  isCountingDownHere: boolean
  onAction: () => void
  onClear: () => void
  onToggleMute: () => void
  onEnded: () => void
}) {
  const videoElRef = useRef<HTMLVideoElement | null>(null)

  // Single source of truth for srcObject / src on this box's <video>
  useEffect(() => {
    const el = videoElRef.current
    if (!el) return

    el.muted = track.status === 'RECORDING' || track.isMuted

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
  }, [track.stream, track.recordedUrl, track.status, track.isMuted])

  useEffect(() => {
    const el = videoElRef.current
    if (!el) return
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [onEnded])

  const showStop = track.status === 'RECORDING' || track.status === 'PLAYING'
  const showPlay = track.status === 'IDLE' && !!track.recordedUrl && !isCountingDownHere
  const showRecord = track.status === 'IDLE' && !track.recordedUrl && !isCountingDownHere

  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden border border-white/15 bg-stone-900">
      <video
        ref={(el) => {
          videoElRef.current = el
          videoRefs.current[slotIndex] = el
        }}
        playsInline
        muted={track.status === 'RECORDING' || track.isMuted}
        {...mobileVideoProps}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Localized 3-second count-in overlay */}
      {isCountingDownHere && countdownValue > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/65 backdrop-blur-[2px]">
          <span
            className="font-black tabular-nums leading-none text-white"
            style={{
              fontSize: 'clamp(48px, 18vw, 96px)',
              textShadow: '0 0 40px rgba(255,255,255,0.35)',
            }}
          >
            {countdownValue}
          </span>
        </div>
      )}

      {/* Mute — top-left */}
      {track.recordedUrl && track.status !== 'RECORDING' && (
        <button
          type="button"
          aria-label={track.isMuted ? 'Unmute track' : 'Mute track'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleMute()
          }}
          className={`absolute left-2 top-2 z-10 ${CIRCLE_BTN} h-7 w-7 ${
            track.isMuted ? 'border-amber-400/50 bg-amber-500/80' : 'border-white/15 bg-black/70'
          }`}
        >
          {track.isMuted ? (
            <VolumeX className="h-3.5 w-3.5" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-white/85" />
          )}
        </button>
      )}

      {/* Track number — bottom-left */}
      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white/80">
        {track.id}
      </span>

      {/* Retake — top-right */}
      {track.recordedUrl && track.status !== 'RECORDING' && !isCountingDownHere && (
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

      {/* Per-box transport — bottom-right */}
      {!isCountingDownHere && (
        <button
          type="button"
          aria-label={showStop ? 'Stop' : showPlay ? 'Play track' : 'Record track'}
          onClick={onAction}
          className={`absolute bottom-2 right-2 z-10 ${CIRCLE_BTN} ${
            showRecord ? 'border-red-400/50 bg-red-500/80' : ''
          }`}
        >
          {showStop && <Square className="h-3.5 w-3.5 fill-white" />}
          {showPlay && <Play className="h-3.5 w-3.5 fill-white" style={{ marginLeft: 1 }} />}
          {showRecord && <span className="h-3 w-3 rounded-full bg-white" />}
        </button>
      )}
    </div>
  )
}

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  const {
    tracks,
    videoRefs,
    isGlobalPlaying,
    hasAnyRecording,
    isAnyRecording,
    isCountingDown,
    countdownTrackId,
    countdownValue,
    startRecording,
    stopRecording,
    playTrack,
    pauseTrack,
    playAll,
    stopAll,
    clearTrack,
    toggleTrackMute,
  } = useMultiTrackStudio()

  const handleAction = useCallback(
    (track: StudioTrack) => {
      if (isCountingDown) return

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
      startRecording(track.id)
    },
    [isCountingDown, pauseTrack, playTrack, startRecording, stopRecording],
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
              slotIndex={track.id - 1}
              videoRefs={videoRefs}
              countdownValue={countdownTrackId === track.id ? countdownValue : 0}
              isCountingDownHere={countdownTrackId === track.id}
              onAction={() => handleAction(track)}
              onClear={() => clearTrack(track.id)}
              onToggleMute={() => toggleTrackMute(track.id)}
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
          disabled={!hasAnyRecording || isAnyRecording || isCountingDown}
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
