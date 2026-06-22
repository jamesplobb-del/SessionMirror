import { useCallback, useRef, useState, type ChangeEvent, type VideoHTMLAttributes } from 'react'
import {
  ArrowLeft,
  Download,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Upload,
  Youtube,
} from 'lucide-react'
import YoutubeUrlDialog from '../YoutubeUrlDialog'
import Pressable from '../ui/Pressable'
import { usePlayalongStudio } from '../../hooks/usePlayalongStudio'
import type { Mp3VaultTrack, PlayalongTopTab } from '../../utils/playalong/types'

interface PlayalongStudioProps {
  onExit: () => void
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide transition ${
        active
          ? 'bg-white text-stone-900 shadow'
          : 'bg-white/10 text-white/70 hover:bg-white/15'
      }`}
    >
      {label}
    </button>
  )
}

function Mp3TrackRow({
  track,
  selected,
  onSelect,
}: {
  track: Mp3VaultTrack
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        selected
          ? 'border-sky-400/60 bg-sky-500/15 text-white'
          : 'border-white/10 bg-black/30 text-white/85 hover:border-white/20'
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
        <Music2 className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{track.title}</span>
        <span className="block text-[10px] uppercase tracking-wider text-white/45">
          {track.source === 'starter' ? 'Starter Pack' : 'Imported'}
        </span>
      </span>
    </button>
  )
}

export default function PlayalongStudio({ onExit }: PlayalongStudioProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const [youtubeDialogOpen, setYoutubeDialogOpen] = useState(false)

  const studio = usePlayalongStudio()
  const {
    phase,
    backingTrackMode,
    backingTrackSource,
    backingTrackLabel,
    mixRatio,
    topTab,
    mp3Tracks,
    recordedTake,
    isReviewPlaying,
    isRecording,
    elapsed,
    cameraReady,
    cameraError,
    exportMessage,
    previewRef,
    backingAudioRef,
    recordedVideoRef,
    youtubeIframeRef,
    setTopTab,
    setMixRatio,
    selectMp3Track,
    selectYoutubeTrack,
    clearBackingTrack,
    importMp3File,
    handleRecordToggle,
    handleReviewPlayPause,
    handleReviewEnded,
    handleRedo,
    handleExport,
    stopRecording,
    pauseBackingSync,
  } = studio

  const handleSafeExit = useCallback(() => {
    if (isRecording) {
      stopRecording()
      pauseBackingSync()
      return
    }
    pauseBackingSync()
    onExit()
  }, [isRecording, onExit, pauseBackingSync, stopRecording])

  const handleImportChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      void importMp3File(file)
    },
    [importMp3File],
  )

  const handleTabChange = useCallback(
    (tab: PlayalongTopTab) => {
      setTopTab(tab)
      if (tab === 'youtube' && backingTrackMode === 'mp3') {
        clearBackingTrack()
      }
      if (tab === 'mp3' && backingTrackMode === 'youtube') {
        clearBackingTrack()
      }
    },
    [backingTrackMode, clearBackingTrack, setTopTab],
  )

  const exportDisabled = backingTrackMode === 'youtube' || !recordedTake
  const showYoutubeIframe =
    backingTrackMode === 'youtube' && Boolean(backingTrackSource)
  const showYoutubeInTop =
    showYoutubeIframe && (phase === 'review' || (phase === 'record' && topTab === 'youtube'))

  return (
    <div className="playalong-studio fixed inset-0 z-[300] flex flex-col bg-black text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <Pressable
          type="button"
          intensity="icon"
          onClick={handleSafeExit}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/50 text-white"
          aria-label="Exit Playalong Studio"
        >
          <ArrowLeft className="h-4 w-4" />
        </Pressable>

        <div className="text-center">
          <p className="text-sm font-semibold tracking-tight">Playalong Studio</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
            {phase === 'record' ? 'Record Phase' : 'Review Phase'}
          </p>
        </div>

        {phase === 'review' ? (
          <Pressable
            type="button"
            intensity="soft"
            onClick={handleRedo}
            className="rounded-full border border-white/15 bg-black/50 px-3 py-1.5 text-[11px] font-semibold text-white/85"
          >
            <span className="inline-flex items-center gap-1">
              <RotateCcw className="h-3 w-3" />
              Redo
            </span>
          </Pressable>
        ) : (
          <div className="h-9 w-9" aria-hidden />
        )}
      </header>

      {/* TOP HALF — backing track */}
      <section className="playalong-studio__top flex min-h-0 flex-1 flex-col border-b border-white/10">
        {phase === 'record' && (
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-2">
            <div className="flex items-center gap-2">
              <TabButton
                active={topTab === 'mp3'}
                label="MP3 Vault"
                onClick={() => handleTabChange('mp3')}
              />
              <TabButton
                active={topTab === 'youtube'}
                label="YouTube Proxy"
                onClick={() => handleTabChange('youtube')}
              />
            </div>

            {topTab === 'mp3' && (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="audio/mpeg,audio/mp3,.mp3,.m4a,audio/mp4"
                  className="sr-only"
                  onChange={handleImportChange}
                />
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => importInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-semibold"
                >
                  <Upload className="h-3 w-3" />
                  Import
                </Pressable>
              </>
            )}

            {topTab === 'youtube' && (
              <Pressable
                type="button"
                intensity="soft"
                onClick={() => setYoutubeDialogOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-[10px] font-semibold text-red-100"
              >
                <Youtube className="h-3 w-3" />
                Load URL
              </Pressable>
            )}
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {/* Single persistent YouTube iframe — avoids ref loss across record/review */}
          {showYoutubeIframe && (
            <div
              className={`absolute inset-0 z-0 ${showYoutubeInTop ? '' : 'pointer-events-none invisible'}`}
              aria-hidden={!showYoutubeInTop}
            >
              <iframe
                ref={youtubeIframeRef}
                src={backingTrackSource}
                className="h-full w-full border-0"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                title="YouTube backing track"
              />
            </div>
          )}

          {phase === 'record' && topTab === 'mp3' && (
            <div className="relative z-[1] flex h-full flex-col gap-2 overflow-y-auto px-4 pb-4">
              {backingTrackMode === 'mp3' && backingTrackLabel && (
                <div className="shrink-0 rounded-2xl border border-white/10 bg-gradient-to-br from-[#5ce625]/10 to-black px-4 py-5 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-sky-300/30 bg-sky-400/10">
                    <Music2 className="h-7 w-7 text-sky-100" />
                  </div>
                  <p className="text-sm font-semibold text-white">{backingTrackLabel}</p>
                  <p className="mt-1 text-[11px] text-white/45">MP3 backing — ready to record</p>
                </div>
              )}

              {mp3Tracks.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/55">
                  <Music2 className="h-8 w-8" />
                  <p className="max-w-xs text-sm leading-relaxed">
                    Import an MP3 backing track to get started. Add starter files under{' '}
                    <code className="text-white/70">public/assets/starter-pack/</code> to ship a
                    built-in vault.
                  </p>
                  <Pressable
                    type="button"
                    intensity="soft"
                    onClick={() => importInputRef.current?.click()}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold"
                  >
                    Import MP3
                  </Pressable>
                </div>
              ) : (
                mp3Tracks.map((track) => (
                  <Mp3TrackRow
                    key={track.id}
                    track={track}
                    selected={
                      backingTrackMode === 'mp3' && backingTrackSource === track.playbackUrl
                    }
                    onSelect={() => selectMp3Track(track)}
                  />
                ))
              )}

            </div>
          )}

          {phase === 'record' && topTab === 'youtube' && !showYoutubeIframe && (
            <div className="relative z-[1] flex h-full flex-col">
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-white/55">
                <Youtube className="h-10 w-10 text-red-400/80" />
                <p className="max-w-sm text-sm leading-relaxed">
                  Load a YouTube reference through the Netlify proxy for practice playback.
                  Export stays locked until you switch to a local MP3.
                </p>
                <Pressable
                  type="button"
                  intensity="soft"
                  onClick={() => setYoutubeDialogOpen(true)}
                  className="rounded-full border border-red-500/40 bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-100"
                >
                  Paste YouTube URL
                </Pressable>
              </div>
            </div>
          )}

          {phase === 'review' && backingTrackMode === 'mp3' && (
            <div className="relative z-[1] flex h-full flex-col items-center justify-center gap-4 bg-gradient-to-b from-black to-black px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10">
                <Music2 className="h-8 w-8 text-sky-200" />
              </div>
              <p className="text-center text-sm font-semibold text-white/90">
                {backingTrackLabel || 'MP3 Backing Track'}
              </p>
              <p className="text-center text-xs text-white/45">Audio routed through hidden player</p>
            </div>
          )}

          {phase === 'review' && backingTrackMode === 'none' && (
            <div className="relative z-[1] flex h-full items-center justify-center px-6 text-sm text-white/45">
              No backing track selected for this take.
            </div>
          )}
        </div>
      </section>

      {/* BOTTOM HALF — camera or recorded take */}
      <section className="playalong-studio__bottom relative flex min-h-0 flex-1 flex-col">
        {phase === 'record' ? (
          <>
            <div className="playalong-studio__camera-shell relative min-h-0 flex-1 overflow-hidden bg-black">
              <video
                ref={previewRef}
                className="playalong-camera-preview"
                muted
                autoPlay
                playsInline
                preload="auto"
                disablePictureInPicture
                {...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>)}
              />
              {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm text-red-200">
                  {cameraError}
                </div>
              )}
              {!cameraReady && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white/60">
                  Starting camera…
                </div>
              )}
              {isRecording && (
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  REC {formatElapsed(elapsed)}
                </div>
              )}
            </div>

            <div className="playalong-studio__controls flex shrink-0 items-center justify-center py-4">
              <button
                type="button"
                onPointerUp={handleRecordToggle}
                disabled={!cameraReady}
                className={`flex h-16 w-16 items-center justify-center rounded-full border-4 transition active:scale-95 disabled:opacity-40 ${
                  isRecording
                    ? 'border-red-300 bg-red-600 text-white'
                    : 'border-white bg-white/10 text-white'
                }`}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isRecording ? (
                  <Square className="h-6 w-6 fill-current" />
                ) : (
                  <span className="h-7 w-7 rounded-full bg-red-500" />
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
              {recordedTake && (
                <video
                  ref={recordedVideoRef}
                  className="playalong-review-video"
                  playsInline
                  preload="auto"
                  disablePictureInPicture
                  {...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>)}
                  onEnded={handleReviewEnded}
                />
              )}
            </div>

            <div className="playalong-studio__controls shrink-0 space-y-3 border-t border-white/10 px-4 py-4">
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onPointerUp={handleReviewPlayPause}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white"
                  aria-label={isReviewPlaying ? 'Pause review' : 'Play review'}
                >
                  {isReviewPlaying ? (
                    <Pause className="h-5 w-5" />
                  ) : (
                    <Play className="h-5 w-5 fill-current" />
                  )}
                </button>
              </div>

              {backingTrackMode !== 'none' && (
                <label className="block space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-white/75">
                    <span>Mix</span>
                    <span className="tabular-nums text-white/45">
                      Take {mixRatio}% · Backing {100 - mixRatio}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={mixRatio}
                    onChange={(event) => setMixRatio(Number(event.target.value))}
                    className="h-2 w-full accent-sky-400"
                    aria-label="Blend recorded take and backing track"
                  />
                </label>
              )}

              <div className="space-y-1">
                <Pressable
                  type="button"
                  intensity="soft"
                  disabled={exportDisabled}
                  title={
                    backingTrackMode === 'youtube'
                      ? 'Export requires a local MP3.'
                      : undefined
                  }
                  onClick={() => void handleExport()}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
                    exportDisabled
                      ? 'cursor-not-allowed border border-white/10 bg-white/5 text-white/35'
                      : 'border border-emerald-400/40 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/25'
                  }`}
                >
                  <Download className="h-4 w-4" />
                  Export to Camera Roll
                </Pressable>

                {backingTrackMode === 'youtube' && (
                  <p className="text-center text-[11px] leading-snug text-amber-200/80">
                    Import an MP3 backing track to unlock social exporting.
                  </p>
                )}

                {exportMessage && (
                  <p className="text-center text-xs text-white/60">{exportMessage}</p>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Hidden MP3 element — keeps backing audio alive across phases */}
      <audio
        ref={backingAudioRef}
        className="sr-only"
        preload="auto"
        playsInline
        {...({ 'webkit-playsinline': 'true' } as React.AudioHTMLAttributes<HTMLAudioElement>)}
      />

      <YoutubeUrlDialog
        open={youtubeDialogOpen}
        onClose={() => setYoutubeDialogOpen(false)}
        onSubmit={(embedUrl) => {
          selectYoutubeTrack(embedUrl)
          setYoutubeDialogOpen(false)
        }}
      />
    </div>
  )
}
