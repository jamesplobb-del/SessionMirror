import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'
import { ArrowLeft, Layers, Play, Square, Volume2, VolumeX, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { applyBulletproofVideoElement, iosBulletproofVideoProps } from '../../utils/mobileVideo'
import { assignMediaPlaybackSrc } from '../../utils/mediaPlayback'
import { useMultiTrackStudio, type StudioCountInPrefs, type StudioTrack } from './useMultiTrackStudio'
import { attachLiveStreamPreview, isLiveMediaStream } from './studioLivePreview'

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
  suppressLivePreview,
  acceptGridInput,
  isSelected,
  isCountingDown,
  onSelect,
  onPlayAction,
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
  suppressLivePreview: boolean
  acceptGridInput: boolean
  isSelected: boolean
  isCountingDown: boolean
  onSelect: () => void
  onPlayAction: () => void
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

    if (track.stream && !suppressLivePreview) {
      void attachLiveStreamPreview(el, track.stream)
      return
    }

    if (track.stream && suppressLivePreview) {
      if (el.srcObject) el.srcObject = null
    }

    if (track.recordedUrl) {
      if (el.srcObject) el.srcObject = null
      applyBulletproofVideoElement(el)
      const safeSrc = assignMediaPlaybackSrc(el, track.recordedUrl)
      if (el.src !== safeSrc) {
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
  }, [track.stream, track.recordedUrl, track.status, suppressLivePreview])

  useEffect(() => {
    const el = videoElRef.current
    if (!el) return
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [onEnded])

  const showStop = track.status === 'RECORDING' || track.status === 'PLAYING'
  const showPlay = track.status === 'IDLE' && !!track.recordedUrl && !showPostRecordReview
  const hasTake = !!track.recordedUrl
  const isRecording = track.status === 'RECORDING'

  const handleCellTap = () => {
    if (!acceptGridInput || showPostRecordReview) return
    onSelect()
  }

  return (
    <div
      className={`studio-track-cell relative min-h-0 min-w-0 flex-1 overflow-hidden border-2 bg-stone-900 transition-colors ${
        isRecording
          ? 'border-red-500/70 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
          : isSelected
            ? 'border-sky-400/70 shadow-[0_0_16px_rgba(56,189,248,0.2)]'
            : isCountingDown
              ? 'border-amber-400/60'
              : hasTake
                ? 'border-white/20'
                : 'border-white/8 border-dashed'
      }`}
      style={hasTake ? { boxShadow: `inset 0 0 0 1px ${accent}33` } : undefined}
      onClick={handleCellTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCellTap()
        }
      }}
    >
      <video
        ref={videoElRef}
        muted
        {...iosBulletproofVideoProps}
        className={`studio-track-video absolute inset-0 h-full w-full object-cover ${
          isRecording || hasTake ? '-scale-x-100' : ''
        }`}
      />

      {!hasTake && !isRecording && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-2">
          <span className="text-[10px] font-medium uppercase tracking-widest text-white/25">
            {isSelected ? 'Ready — tap Record' : 'Tap to select'}
          </span>
        </div>
      )}

      {isCountingDown && !isRecording && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
          <span className="rounded-full border border-amber-400/40 bg-black/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-amber-200/90">
            Count-in…
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

      {showPlay && !showPostRecordReview && (
        <button
          type="button"
          aria-label="Play part"
          onClick={(e) => {
            e.stopPropagation()
            onPlayAction()
          }}
          className={`absolute bottom-2 right-2 z-10 ${CIRCLE_BTN}`}
        >
          <Play className="h-3.5 w-3.5 fill-white" style={{ marginLeft: 1 }} />
        </button>
      )}

      {showStop && !showPostRecordReview && track.status === 'PLAYING' && (
        <button
          type="button"
          aria-label="Stop playback"
          onClick={(e) => {
            e.stopPropagation()
            onPlayAction()
          }}
          className={`absolute bottom-2 right-2 z-10 ${CIRCLE_BTN}`}
        >
          <Square className="h-3.5 w-3.5 fill-white" />
        </button>
      )}
    </div>
  )
}

function FullscreenTrackLayer({
  track,
  slotIndex,
  isCountingDown,
  isRecording,
  recordingElapsed,
  cameraError,
  onBack,
  onStop,
}: {
  track: StudioTrack
  slotIndex: number
  isCountingDown: boolean
  isRecording: boolean
  recordingElapsed: number
  cameraError: string | null
  onBack: () => void
  onStop: () => void
}) {
  const previewRef = useRef<HTMLVideoElement | null>(null)
  const accent = TRACK_COLORS[slotIndex] ?? TRACK_COLORS[0]
  const showCamera = isLiveMediaStream(track.stream)

  useLayoutEffect(() => {
    const el = previewRef.current
    if (!el || !track.stream) {
      if (el?.srcObject) el.srcObject = null
      return
    }

    let cancelled = false
    let retryTimer: number | null = null

    const attach = async (attempt = 0) => {
      if (cancelled || !track.stream) return
      const ok = await attachLiveStreamPreview(el, track.stream)
      if (cancelled) return
      if (!ok && attempt < 3) {
        retryTimer = window.setTimeout(() => void attach(attempt + 1), 200)
      }
    }

    void attach()

    return () => {
      cancelled = true
      if (retryTimer !== null) window.clearTimeout(retryTimer)
    }
  }, [track.stream, track.id])

  return (
    <div className="fixed inset-0 z-[250] flex flex-col bg-black">
      <video
        ref={previewRef}
        autoPlay
        muted
        {...iosBulletproofVideoProps}
        className={`studio-immersive-preview absolute inset-0 h-full w-full object-cover camera-preview camera-preview--mirror ${
          showCamera ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {!showCamera && !isRecording && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black px-6 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
          <span className="text-sm font-semibold text-white/70">
            {cameraError ?? 'Starting camera…'}
          </span>
        </div>
      )}

      {isCountingDown && !isRecording && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/30">
          <span className="rounded-full border border-amber-400/40 bg-black/55 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-amber-200/90">
            Count-in…
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {!isRecording ? (
          <button
            type="button"
            aria-label="Exit fullscreen preview"
            onClick={onBack}
            className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-xs font-semibold text-white/85 active:scale-95"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-red-400">REC</span>
            <span className="text-xs tabular-nums text-white/80">{formatElapsed(recordingElapsed)}</span>
          </div>
        )}
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90"
          style={{ backgroundColor: `${accent}cc` }}
        >
          Part {track.id}
        </span>
      </div>

      {isRecording && (
        <button
          type="button"
          aria-label="Stop recording"
          onClick={onStop}
          className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white/40 bg-red-500/90 text-white shadow-[0_4px_24px_rgba(239,68,68,0.45)] active:scale-90"
        >
          <Square className="h-6 w-6 fill-white" />
        </button>
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

function StudioCountInControls({
  prefs,
  onChange,
}: {
  prefs: StudioCountInPrefs
  onChange: (next: StudioCountInPrefs) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 px-2 py-1.5 text-[10px] text-white/70">
      <label className="flex items-center gap-1.5">
        <span className="uppercase tracking-wide text-white/45">BPM</span>
        <input
          type="number"
          min={40}
          max={240}
          value={prefs.bpm}
          onChange={(e) =>
            onChange({ ...prefs, bpm: Math.max(40, Math.min(240, Number(e.target.value) || 120)) })
          }
          className="w-14 rounded-md border border-white/15 bg-black/40 px-2 py-1 text-center text-white"
        />
      </label>
      <label className="flex items-center gap-1.5">
        <span className="uppercase tracking-wide text-white/45">Count</span>
        <select
          value={prefs.countInBeats}
          onChange={(e) =>
            onChange({
              ...prefs,
              countInBeats: Number(e.target.value) === 16 ? 16 : 8,
            })
          }
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white"
        >
          <option value={8}>8</option>
          <option value={16}>16</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="uppercase tracking-wide text-white/45">Meter</span>
        <select
          value={prefs.beatsPerBar}
          onChange={(e) =>
            onChange({
              ...prefs,
              beatsPerBar: Number(e.target.value) as StudioCountInPrefs['beatsPerBar'],
            })
          }
          className="rounded-md border border-white/15 bg-black/40 px-2 py-1 text-white"
        >
          <option value={2}>2/4</option>
          <option value={3}>3/4</option>
          <option value={4}>4/4</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={prefs.metronomeDuringRep}
          onChange={(e) => onChange({ ...prefs, metronomeDuringRep: e.target.checked })}
          className="rounded border-white/20"
        />
        <span>Metronome through take</span>
      </label>
    </div>
  )
}

export default function StudioSandbox({ onExit }: StudioSandboxProps) {
  const [mixerOpen, setMixerOpen] = useState(false)
  const [acceptGridInput, setAcceptGridInput] = useState(false)

  useEffect(() => {
    const unlockTimer = window.setTimeout(() => setAcceptGridInput(true), 350)
    return () => window.clearTimeout(unlockTimer)
  }, [])

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
    selectedTrackId,
    countInPrefs,
    postRecordReviewId,
    recordingElapsed,
    isArmingCamera,
    cameraError,
    selectTrack,
    beginRecordingSession,
    setCountInPrefs,
    stopRecording,
    cancelRecordingSession,
    playTrack,
    pauseTrack,
    playAll,
    stopAll,
    clearTrack,
    toggleTrackMute,
    setTrackVolume,
    keepRecordedTake,
    redoRecordedTake,
    deselectTrack,
  } = useMultiTrackStudio()

  const immersiveTrack = immersiveTrackId
    ? tracks.find((t) => t.id === immersiveTrackId)
    : undefined

  const showImmersiveOverlay = Boolean(isImmersive && immersiveTrack)
  const immersiveIsRecording = immersiveTrack?.status === 'RECORDING'

  useEffect(() => {
    if (isImmersive) setMixerOpen(false)
  }, [isImmersive])

  const handlePlayAction = useCallback(
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
      }
    },
    [isCountingDown, pauseTrack, playTrack, postRecordReviewId, stopRecording],
  )

  const handleGlobalPlayStop = useCallback(() => {
    if (isGlobalPlaying) stopAll()
    else void playAll()
  }, [isGlobalPlaying, playAll, stopAll])

  return (
    <div
      className={`fixed inset-0 z-[200] flex h-screen w-screen flex-col bg-black text-white ${
        acceptGridInput ? '' : 'pointer-events-none'
      }`}
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
        {!isImmersive && (
          <StudioCountInControls prefs={countInPrefs} onChange={setCountInPrefs} />
        )}

        {cameraError && !isImmersive && (
          <p className="mb-1 px-2 text-center text-[10px] font-medium text-amber-300/90">
            {cameraError}
          </p>
        )}

        <div
          className={`studio-grid grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5 ${
            isImmersive ? 'pointer-events-none' : ''
          } ${isGlobalPlaying ? 'studio-grid--playing' : ''}`}
        >
          {tracks.map((track) => (
            <TrackBox
              key={track.id}
              track={track}
              slotIndex={track.id - 1}
              videoRefs={videoRefs}
              showPostRecordReview={postRecordReviewId === track.id}
              suppressLivePreview={isImmersive}
              acceptGridInput={acceptGridInput}
              isSelected={selectedTrackId === track.id}
              isCountingDown={countdownTrackId === track.id}
              onSelect={() => void selectTrack(track.id)}
              onPlayAction={() => handlePlayAction(track)}
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

      <div
        className={`flex shrink-0 flex-col items-center gap-2 px-4 ${
          showImmersiveOverlay ? 'fixed inset-x-0 bottom-0 z-[260]' : ''
        }`}
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        {!immersiveIsRecording && (
          <>
            <div className="flex items-center justify-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label="Record selected part"
                  onClick={() => void beginRecordingSession()}
                  disabled={
                    !selectedTrackId ||
                    isAnyRecording ||
                    isCountingDown ||
                    isArmingCamera ||
                    Boolean(armingTrackId)
                  }
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-red-400/60 bg-red-500/90 text-white shadow-[0_0_24px_rgba(239,68,68,0.35)] transition active:scale-90 disabled:opacity-35"
                >
                  <span className="h-5 w-5 rounded-full bg-white" />
                </button>
                <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
                  Record
                </span>
              </div>

              <div className="flex flex-col items-center gap-1">
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
            </div>

            {isCountingDown && (
              <button
                type="button"
                onClick={() => {
                  if (countdownTrackId) void cancelRecordingSession(countdownTrackId)
                }}
                className="text-[10px] font-medium uppercase tracking-wide text-white/50 underline"
              >
                Cancel count-in
              </button>
            )}
          </>
        )}
      </div>

      {showImmersiveOverlay && immersiveTrack && (
        <FullscreenTrackLayer
          track={immersiveTrack}
          slotIndex={immersiveTrack.id - 1}
          isCountingDown={countdownTrackId === immersiveTrack.id}
          isRecording={immersiveTrack.status === 'RECORDING'}
          recordingElapsed={recordingElapsed}
          cameraError={cameraError}
          onBack={() => void deselectTrack()}
          onStop={() => stopRecording(immersiveTrack.id)}
        />
      )}
    </div>
  )
}
