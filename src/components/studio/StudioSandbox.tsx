import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'
import { ArrowLeft, Layers, Play, Square, Volume2, VolumeX, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { mobileVideoProps } from '../../utils/mobileVideo'
import { agentDebugLog } from '../../utils/agentDebugLog'
import { useMultiTrackStudio, type StudioTrack } from './useMultiTrackStudio'

interface StudioSandboxProps {
  onExit: () => void
}

const CIRCLE_BTN =
  'flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-[0_2px_8px_rgba(0,0,0,0.5)] backdrop-blur-sm transition active:scale-90'

const TRACK_COLORS = ['#38bdf8', '#c084fc', '#34d399', '#fb923c'] as const

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TrackBox({
  track,
  slotIndex,
  videoRefs,
  showPostRecordReview,
  onAction,
  onClear,
  onToggleMute,
  onKeepTake,
  onRedoTake,
  onEnded,
}: {
  track: StudioTrack
  slotIndex: number
  videoRefs: MutableRefObject<(HTMLVideoElement | null)[]>
  showPostRecordReview: boolean
  onAction: () => void
  onClear: () => void
  onToggleMute: () => void
  onKeepTake: () => void
  onRedoTake: () => void
  onEnded: () => void
}) {
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const accent = TRACK_COLORS[slotIndex] ?? TRACK_COLORS[0]

  useLayoutEffect(() => {
    videoRefs.current[slotIndex] = videoElRef.current
  })

  useEffect(() => {
    const el = videoElRef.current
    if (!el) return

    if (track.status === 'RECORDING' && track.stream) {
      // #region agent log
      agentDebugLog(
        'StudioSandbox.tsx:TrackBox',
        'video bind live stream',
        { partId: track.id, hasSrcObject: !!el.srcObject },
        'B',
        'studio-ui',
      )
      // #endregion
      if (el.srcObject !== track.stream) {
        el.srcObject = track.stream
        el.removeAttribute('src')
      }
      el.muted = true
      void el.play().catch(() => {})
      return
    }

    if (track.recordedUrl) {
      // #region agent log
      agentDebugLog(
        'StudioSandbox.tsx:TrackBox',
        'video bind recordedUrl',
        {
          partId: track.id,
          status: track.status,
          hasSrcObject: !!el.srcObject,
          srcPrefix: track.recordedUrl.slice(0, 20),
        },
        'B',
        'studio-ui',
      )
      // #endregion
      if (el.srcObject) el.srcObject = null
      if (el.src !== track.recordedUrl) {
        el.src = track.recordedUrl
        el.load()
      }
      if (track.status !== 'PLAYING' && !el.paused) {
        el.pause()
      }
      return
    }

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
  const showPlay = track.status === 'IDLE' && !!track.recordedUrl && !showPostRecordReview
  const showRecord = track.status === 'IDLE' && !track.recordedUrl && !showPostRecordReview
  const hasTake = !!track.recordedUrl
  const isRecording = track.status === 'RECORDING'

  const handleCellTap = () => {
    if (showRecord) onAction()
  }

  return (
    <div
      className={`studio-track-cell relative min-h-0 min-w-0 flex-1 overflow-hidden border-2 bg-stone-900 transition-colors ${
        isRecording
          ? 'border-red-500/70 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
          : hasTake
            ? 'border-white/20'
            : 'border-white/8 border-dashed'
      }`}
      style={hasTake ? { boxShadow: `inset 0 0 0 1px ${accent}33` } : undefined}
      onClick={handleCellTap}
      role={showRecord ? 'button' : undefined}
      tabIndex={showRecord ? 0 : undefined}
      onKeyDown={
        showRecord
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onAction()
              }
            }
          : undefined
      }
    >
      <video
        ref={videoElRef}
        playsInline
        muted
        {...mobileVideoProps}
        className={`absolute inset-0 h-full w-full object-cover camera-preview ${
          isRecording || hasTake ? 'camera-preview--mirror' : ''
        }`}
      />

      {!hasTake && !isRecording && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-white/25">
            Tap to record
          </span>
        </div>
      )}

      {showPostRecordReview && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Take saved</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onKeepTake}
              className="rounded-full bg-emerald-500/90 px-4 py-2 text-xs font-bold text-white active:scale-95"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={onRedoTake}
              className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-bold text-white active:scale-95"
            >
              Re-record
            </button>
          </div>
        </div>
      )}

      {hasTake && !isRecording && !showPostRecordReview && (
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

      <span
        className="pointer-events-none absolute bottom-2 left-2 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90"
        style={{ backgroundColor: `${accent}cc` }}
      >
        Part {track.id}
      </span>

      {hasTake && !isRecording && !showPostRecordReview && (
        <button
          type="button"
          aria-label={`Clear part ${track.id}`}
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          className={`absolute right-2 top-2 z-10 ${CIRCLE_BTN} h-7 w-7 border-white/15 bg-black/70`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {!showPostRecordReview && (
        <button
          type="button"
          aria-label={showStop ? 'Stop' : showPlay ? 'Play part' : 'Record part'}
          onClick={(e) => {
            e.stopPropagation()
            onAction()
          }}
          className={`absolute bottom-2 right-2 z-10 ${CIRCLE_BTN} ${
            showRecord ? 'border-red-400/50 bg-red-500/85' : ''
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

function ImmersiveRecordingLayer({
  track,
  slotIndex,
  countdownValue,
  isCountingDown,
  isArming,
  recordingElapsed,
  onStop,
}: {
  track: StudioTrack
  slotIndex: number
  countdownValue: number
  isCountingDown: boolean
  isArming: boolean
  recordingElapsed: number
  onStop: () => void
}) {
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const accent = TRACK_COLORS[slotIndex] ?? TRACK_COLORS[0]
  const isRecording = track.status === 'RECORDING'

  useEffect(() => {
    const el = previewRef.current
    if (!el) return

    if (isRecording && track.stream) {
      if (el.srcObject !== track.stream) {
        el.srcObject = track.stream
        el.removeAttribute('src')
      }
      el.muted = true
      void el.play().catch(() => {})
      return
    }

    if (el.srcObject) el.srcObject = null
  }, [isRecording, track.stream])

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-black">
      {isRecording && track.stream && (
        <video
          ref={previewRef}
          playsInline
          muted
          {...mobileVideoProps}
          className="absolute inset-0 h-full w-full object-cover camera-preview camera-preview--mirror"
        />
      )}

      {isCountingDown && countdownValue > 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
          <span
            className="font-black tabular-nums leading-none text-white"
            style={{
              fontSize: 'clamp(72px, 28vw, 140px)',
              textShadow: countdownValue === 1 ? '0 0 48px rgba(248,113,113,0.7)' : undefined,
              color: countdownValue === 1 ? '#fca5a5' : '#fff',
            }}
          >
            {countdownValue}
          </span>
        </div>
      )}

      {isArming && !isRecording && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
          <span className="text-sm font-semibold text-white/70">Starting camera…</span>
        </div>
      )}

      {isRecording && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-red-400">REC</span>
              <span className="text-xs tabular-nums text-white/80">{formatElapsed(recordingElapsed)}</span>
            </div>
            <span
              className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90"
              style={{ backgroundColor: `${accent}cc` }}
            >
              Part {track.id}
            </span>
          </div>

          <button
            type="button"
            aria-label="Stop recording"
            onClick={onStop}
            className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white/40 bg-red-500/90 text-white shadow-[0_4px_24px_rgba(239,68,68,0.45)] active:scale-90"
          >
            <Square className="h-6 w-6 fill-white" />
          </button>
        </>
      )}
    </div>
  )
}

function MixerDrawer({
  tracks,
  onVolumeChange,
  onMuteToggle,
  onClose,
}: {
  tracks: StudioTrack[]
  onVolumeChange: (id: 1 | 2 | 3 | 4, volume: number) => void
  onMuteToggle: (id: 1 | 2 | 3 | 4) => void
  onClose: () => void
}) {
  return (
    <>
      <div className="absolute inset-0 z-30 bg-black/50" onClick={onClose} aria-hidden />
      <div className="absolute inset-x-0 bottom-0 z-40 max-h-[45%] overflow-y-auto rounded-t-2xl border-t border-white/10 bg-zinc-900/95 px-4 pb-6 pt-3 backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-white/40" />
            <span className="text-sm font-bold">Mixer</span>
          </div>
          <button type="button" onClick={onClose} className={`${CIRCLE_BTN} h-7 w-7`} aria-label="Close mixer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {tracks.map((track, idx) => {
          const color = TRACK_COLORS[idx] ?? TRACK_COLORS[0]
          const vol = Math.round(track.volume * 100)
          return (
            <div
              key={track.id}
              className={`flex items-center gap-3 py-2.5 ${idx < tracks.length - 1 ? 'border-b border-white/6' : ''} ${!track.recordedUrl ? 'opacity-40' : ''}`}
            >
              <span className="w-12 shrink-0 text-[10px] font-bold uppercase" style={{ color }}>
                Part {track.id}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={vol}
                disabled={!track.recordedUrl}
                onChange={(e) => onVolumeChange(track.id, Number(e.target.value) / 100)}
                className="studio-vol-slider min-w-0 flex-1"
                style={{ '--fill-pct': `${vol}%`, '--fill-color': color } as CSSProperties}
                aria-label={`Part ${track.id} volume`}
              />
              <button
                type="button"
                disabled={!track.recordedUrl}
                onClick={() => onMuteToggle(track.id)}
                className={`${CIRCLE_BTN} h-7 w-7 shrink-0 disabled:opacity-30 ${track.isMuted ? 'border-amber-400/50 bg-amber-500/80' : ''}`}
                aria-label={track.isMuted ? 'Unmute' : 'Mute'}
              >
                {track.isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  const [mixerOpen, setMixerOpen] = useState(false)

  const {
    tracks,
    videoRefs,
    isGlobalPlaying,
    hasAnyRecording,
    isAnyRecording,
    isCountingDown,
    isImmersive,
    immersiveTrackId,
    armingTrackId,
    countdownTrackId,
    countdownValue,
    postRecordReviewId,
    recordingElapsed,
    startRecording,
    stopRecording,
    playTrack,
    pauseTrack,
    playAll,
    stopAll,
    clearTrack,
    toggleTrackMute,
    setTrackVolume,
    keepRecordedTake,
    redoRecordedTake,
  } = useMultiTrackStudio()

  const immersiveTrack = immersiveTrackId
    ? tracks.find((t) => t.id === immersiveTrackId)
    : undefined

  // #region agent log
  useEffect(() => {
    agentDebugLog(
      'StudioSandbox.tsx:render',
      'studio UI state',
      {
        isImmersive,
        immersiveTrackId,
        postRecordReviewId,
        isAnyRecording,
        hasAnyRecording,
        isCountingDown,
        showFooter: !isImmersive,
        showHeader: !isImmersive,
        tracks: tracks.map((t) => ({
          id: t.id,
          status: t.status,
          hasStream: !!t.stream,
          hasRecordedUrl: !!t.recordedUrl,
        })),
      },
      'A',
      'studio-ui',
    )
  }, [
    isImmersive,
    immersiveTrackId,
    postRecordReviewId,
    isAnyRecording,
    hasAnyRecording,
    isCountingDown,
    tracks,
  ])
  // #endregion

  const showImmersiveOverlay = Boolean(
    isImmersive &&
      immersiveTrack &&
      (immersiveTrack.stream ||
        countdownTrackId === immersiveTrack.id ||
        armingTrackId === immersiveTrack.id),
  )

  // #region agent log
  useEffect(() => {
    agentDebugLog(
      'StudioSandbox.tsx:overlay',
      'immersive overlay visibility',
      { showImmersiveOverlay, immersiveTrackId, postRecordReviewId },
      'C',
      'studio-ui',
    )
  }, [showImmersiveOverlay, immersiveTrackId, postRecordReviewId])
  // #endregion

  useEffect(() => {
    if (isImmersive) setMixerOpen(false)
  }, [isImmersive])

  const handleAction = useCallback(
    (track: StudioTrack) => {
      if (isCountingDown || postRecordReviewId === track.id) return

      if (track.status === 'RECORDING') {
        stopRecording(track.id)
        return
      }
      if (track.status === 'PLAYING') {
        pauseTrack(track.id)
        return
      }
      if (track.recordedUrl) {
        void playTrack(track.id)
        return
      }
      startRecording(track.id)
    },
    [isCountingDown, pauseTrack, playTrack, postRecordReviewId, startRecording, stopRecording],
  )

  const handleGlobalPlayStop = useCallback(() => {
    if (isGlobalPlaying) stopAll()
    else void playAll()
  }, [isGlobalPlaying, playAll, stopAll])

  return (
    <div
      className="fixed inset-0 z-[200] flex h-screen w-screen flex-col bg-black text-white"
      style={{ paddingTop: isImmersive ? 0 : 'env(safe-area-inset-top)' }}
    >
      {!isImmersive && (
        <header className="flex shrink-0 items-center justify-between px-3 py-2">
          <Pressable
            intensity="soft"
            onClick={onExit}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 active:scale-95"
            aria-label="Exit Studio"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit
          </Pressable>

          <div className="flex flex-col items-center">
            <span className="text-xs font-bold tracking-tight">Acapella Studio</span>
            <span className="text-[9px] text-white/35">Use headphones when recording</span>
          </div>

          <button
            type="button"
            onClick={() => setMixerOpen((o) => !o)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold active:scale-95 ${
              mixerOpen ? 'border-sky-400/50 bg-sky-500/15 text-sky-300' : 'border-white/15 bg-white/8 text-white/70'
            }`}
            aria-label="Open mixer"
          >
            <Layers className="h-3.5 w-3.5" />
            Mix
          </button>
        </header>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col p-2 pb-1">
        {/* Grid always stays in layout — videos remain in their boxes for playback */}
        <div
          className={`grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5 ${
            isImmersive ? 'pointer-events-none' : ''
          }`}
        >
          {tracks.map((track) => (
            <TrackBox
              key={track.id}
              track={track}
              slotIndex={track.id - 1}
              videoRefs={videoRefs}
              showPostRecordReview={postRecordReviewId === track.id}
              onAction={() => handleAction(track)}
              onClear={() => clearTrack(track.id)}
              onToggleMute={() => toggleTrackMute(track.id)}
              onKeepTake={() => keepRecordedTake(track.id)}
              onRedoTake={() => redoRecordedTake(track.id)}
              onEnded={() => pauseTrack(track.id)}
            />
          ))}
        </div>

        {mixerOpen && !isImmersive && (
          <MixerDrawer
            tracks={tracks}
            onVolumeChange={setTrackVolume}
            onMuteToggle={toggleTrackMute}
            onClose={() => setMixerOpen(false)}
          />
        )}
      </div>

      {!isImmersive && (
        <div
          className="flex shrink-0 items-center justify-center gap-4 px-4"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            aria-label={isGlobalPlaying ? 'Stop all parts' : 'Play all parts'}
            onClick={handleGlobalPlayStop}
            disabled={!hasAnyRecording || isAnyRecording || isCountingDown}
            className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/30 bg-white text-black shadow-[0_0_24px_rgba(255,255,255,0.15)] transition active:scale-90 disabled:opacity-35"
          >
            {isGlobalPlaying ? (
              <Square className="h-5 w-5 fill-black" />
            ) : (
              <Play className="h-5 w-5 fill-black" style={{ marginLeft: 2 }} />
            )}
          </button>
          <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            {isGlobalPlaying ? 'Stop All' : 'Play All'}
          </span>
        </div>
      )}

      {showImmersiveOverlay && immersiveTrack && (
        <ImmersiveRecordingLayer
          track={immersiveTrack}
          slotIndex={immersiveTrack.id - 1}
          countdownValue={countdownTrackId === immersiveTrack.id ? countdownValue : 0}
          isCountingDown={countdownTrackId === immersiveTrack.id}
          isArming={armingTrackId === immersiveTrack.id}
          recordingElapsed={recordingElapsed}
          onStop={() => stopRecording(immersiveTrack.id)}
        />
      )}
    </div>
  )
}
