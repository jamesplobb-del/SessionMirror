import { useRef, memo, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import BestTakeBox from './BestTakeBox'
import PipWindow from './PipWindow'
import Pressable from './ui/Pressable'
import { useDragToPin, type PipDragUiState } from '../hooks/useDragToPin'
import type { Take } from '../types'
import type { LibraryPlaybackReference } from '../types/library'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'
import { iosDragGhostTransition, motionGpuLayer } from '../utils/motionPresets'
import { takeHasPlaybackMedia } from '../utils/takes'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'

export interface PipCompareRowProps {
  compact?: boolean
  benchmarkTake: Take | null
  libraryBenchmarkPlayback: LibraryPlaybackReference | null
  challengerTake: Take | null
  youtubeEmbedUrl: string | null
  suspendPipPlayback: boolean
  benchmarkPipVideoRef: RefObject<HTMLMediaElement | null>
  challengerPipVideoRef: RefObject<HTMLMediaElement | null>
  deleteDropRef: RefObject<HTMLElement | null>
  onPinBenchmark: (takeId: string) => void
  onPinChallenger: (takeId: string) => void
  onDeleteTake: (takeId: string) => void
  onUnpinBenchmark: () => void
  onClearLibraryReference?: () => void
  onUnpinChallenger: () => void
  onUploadBenchmark: (file: File) => void
  onSubmitYoutube: (embedUrl: string) => void
  onClearYoutube: () => void
  onToggleSplitView: () => void
  onExpandBenchmark?: () => void
  onExpandChallenger?: () => void
  onDragStateChange?: (state: PipDragUiState) => void
  onBenchmarkPlaybackChange?: (playing: boolean) => void
  onChallengerPlaybackChange?: (playing: boolean) => void
  challengerAutoPlayRequestId?: string | null
  onChallengerAutoPlayComplete?: () => void
  hapticFeedback?: boolean
  showPinCurrentAsBest?: boolean
  onPinCurrentAsBest?: () => void
  onYoutubeHostChange?: (el: HTMLDivElement | null) => void
  youtubeIframeRef?: RefObject<HTMLIFrameElement | null>
}

function formatCompactDuration(duration?: number): string | null {
  if (!duration || !Number.isFinite(duration) || duration <= 0) return null
  const rounded = Math.max(0, Math.round(duration))
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatCompactTimestamp(timestamp?: number): string | null {
  if (!timestamp || !Number.isFinite(timestamp)) return null
  const age = Date.now() - timestamp
  if (age >= 0 && age < 45_000) return 'Just now'
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function CompactTakeCaption({
  label,
  tone,
  name,
  timestamp,
  duration,
  hasMedia,
  youtube = false,
  library = false,
  onOpen,
  hapticFeedback,
}: {
  label: string
  tone: 'best' | 'current'
  name: string
  timestamp?: number
  duration?: number
  hasMedia: boolean
  youtube?: boolean
  library?: boolean
  onOpen?: () => void
  hapticFeedback: boolean
}) {
  const formattedDuration = formatCompactDuration(duration)
  const formattedTimestamp = formatCompactTimestamp(timestamp)
  const source = youtube ? 'YouTube' : library ? 'Library' : formattedTimestamp
  const detail =
    [source, formattedDuration].filter(Boolean).join(' · ') ||
    (tone === 'best' ? 'Upload or YouTube' : 'Record a take')

  const content = (
    <>
      <span className="compact-take-caption__label">{label}</span>
      <span className="compact-take-caption__name">{name}</span>
      <span className="compact-take-caption__detail">{detail}</span>
    </>
  )

  return hasMedia && onOpen ? (
    <Pressable
      type="button"
      intensity="soft"
      squish={false}
      haptic="light"
      hapticFeedback={hapticFeedback}
      className={`compact-take-caption compact-take-caption--${tone}`}
      onClick={onOpen}
      aria-label={`Open ${label} full screen`}
    >
      {content}
    </Pressable>
  ) : (
    <div className={`compact-take-caption compact-take-caption--${tone}`}>{content}</div>
  )
}

function CompactTakeClearButton({
  label,
  onClear,
  hapticFeedback,
}: {
  label: string
  onClear: () => void
  hapticFeedback: boolean
}) {
  return (
    <Pressable
      type="button"
      intensity="icon"
      squish={false}
      haptic="light"
      hapticFeedback={hapticFeedback}
      className="compact-take-card__clear"
      onClick={onClear}
      aria-label={`Unload ${label}`}
    >
      <X aria-hidden />
    </Pressable>
  )
}

export function PipDragGhost({
  take,
  x,
  y,
  overDelete,
  actionLabel = 'Pin',
}: {
  take: Take
  x: number
  y: number
  overDelete: boolean
  actionLabel?: string
}) {
  const poster =
    take.thumbnailUrl ||
    (take.mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : undefined)

  return (
    <div
      className="pip-drag-ghost pointer-events-none fixed z-[60]"
      style={{
        ...motionGpuLayer,
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <motion.div
        className={`pip-drag-ghost-inner ui-orient-spin overflow-hidden rounded-xl border-[0.5px] border-white/10 bg-black shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-2 ${
          overDelete
            ? 'border-red-400/70 ring-red-400/50'
            : 'border-cyan-400/60 ring-cyan-400/40'
        }`}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: overDelete ? 1.05 : 1 }}
        transition={iosDragGhostTransition}
      >
        {poster ? (
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-black" />
        )}
        <span
          className={`absolute bottom-1 left-1 rounded px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-white ${
            overDelete ? 'bg-red-500/90' : 'bg-sky-500/90'
          }`}
        >
          {overDelete ? 'Delete' : actionLabel}
        </span>
      </motion.div>
    </div>
  )
}

export default memo(function PipCompareRow({
  compact = false,
  benchmarkTake,
  libraryBenchmarkPlayback,
  challengerTake,
  youtubeEmbedUrl,
  suspendPipPlayback,
  benchmarkPipVideoRef,
  challengerPipVideoRef,
  deleteDropRef,
  onPinBenchmark,
  onPinChallenger,
  onDeleteTake,
  onUnpinBenchmark,
  onClearLibraryReference,
  onUnpinChallenger,
  onUploadBenchmark,
  onSubmitYoutube,
  onClearYoutube,
  onToggleSplitView,
  onExpandBenchmark,
  onExpandChallenger,
  onDragStateChange,
  onBenchmarkPlaybackChange,
  onChallengerPlaybackChange,
  challengerAutoPlayRequestId = null,
  onChallengerAutoPlayComplete,
  hapticFeedback = true,
  showPinCurrentAsBest = false,
  onPinCurrentAsBest,
  onYoutubeHostChange,
  youtubeIframeRef,
}: PipCompareRowProps) {
  const benchmarkDropRef = useRef<HTMLDivElement>(null)
  const challengerDropRef = useRef<HTMLDivElement>(null)

  const {
    ghost: challengerGhost,
    isDragging: challengerDragging,
    isArming: challengerArming,
    dragSourceProps: challengerDragSourceProps,
  } = useDragToPin({
    sourceTakeId: challengerTake?.id ?? null,
    dropTargetRef: benchmarkDropRef,
    deleteDropTargetRef: deleteDropRef,
    onPin: onPinBenchmark,
    onDelete: onDeleteTake,
    onTap: onExpandChallenger,
    onDragStateChange,
    enabled: !compact && takeHasPlaybackMedia(challengerTake),
    hapticFeedback,
  })

  const {
    ghost: benchmarkGhost,
    isDragging: benchmarkDragging,
    isArming: benchmarkArming,
    dragSourceProps: benchmarkDragSourceProps,
  } = useDragToPin({
    sourceTakeId: libraryBenchmarkPlayback || youtubeEmbedUrl ? null : benchmarkTake?.id ?? null,
    dropTargetRef: challengerDropRef,
    onPin: onPinChallenger,
    onTap: onExpandBenchmark,
    onDragStateChange,
    enabled:
      !compact &&
      takeHasPlaybackMedia(benchmarkTake) &&
      !libraryBenchmarkPlayback &&
      !youtubeEmbedUrl,
    hapticFeedback,
  })

  const compactBenchmarkHasMedia = Boolean(
    youtubeEmbedUrl || libraryBenchmarkPlayback || takeHasPlaybackMedia(benchmarkTake),
  )
  const clearCompactBenchmark = youtubeEmbedUrl
    ? onClearYoutube
    : libraryBenchmarkPlayback
    ? onClearLibraryReference ?? onUnpinBenchmark
    : onUnpinBenchmark

  return (
    <>
      <div
        className={`app-pip-row ${compact ? 'app-pip-row--compact' : ''}`}
        data-tutorial="pip-row"
      >
        <div
          ref={benchmarkDropRef}
          className={`app-pip-slot pointer-events-auto ${
            compact ? 'compact-take-slot compact-take-slot--best' : ''
          }`}
        >
          <BestTakeBox
            layout="pip"
            compact={compact}
            take={benchmarkTake}
            libraryPlayback={libraryBenchmarkPlayback}
            youtubeEmbedUrl={youtubeEmbedUrl}
            suspendPlayback={suspendPipPlayback}
            videoRef={benchmarkPipVideoRef}
            dropHighlight={challengerGhost?.overPin ?? false}
            onUnpinTake={onUnpinBenchmark}
            onClearLibraryReference={onClearLibraryReference}
            onClearYoutube={onClearYoutube}
            onSubmitYoutube={onSubmitYoutube}
            onUpload={onUploadBenchmark}
            onToggleSplitView={onToggleSplitView}
            onExpand={
              libraryBenchmarkPlayback || takeHasPlaybackMedia(benchmarkTake)
                ? onExpandBenchmark
                : undefined
            }
            onPlaybackChange={onBenchmarkPlaybackChange}
            onYoutubeHostChange={onYoutubeHostChange}
            youtubeIframeRef={youtubeIframeRef}
            dragSourceActive={benchmarkDragging}
            dragSourceArming={benchmarkArming}
            dragSourceProps={
              takeHasPlaybackMedia(benchmarkTake) && !libraryBenchmarkPlayback && !youtubeEmbedUrl
                ? benchmarkDragSourceProps
                : undefined
            }
          />
          {compact && (
            <CompactTakeCaption
              label="Best Take"
              tone="best"
              name={
                libraryBenchmarkPlayback?.name ??
                (youtubeEmbedUrl ? 'YouTube Reference' : benchmarkTake?.name ?? 'No best take')
              }
              timestamp={
                libraryBenchmarkPlayback || youtubeEmbedUrl
                  ? undefined
                  : benchmarkTake?.timestamp
              }
              duration={libraryBenchmarkPlayback?.duration ?? benchmarkTake?.duration}
              hasMedia={compactBenchmarkHasMedia}
              youtube={Boolean(youtubeEmbedUrl)}
              library={Boolean(libraryBenchmarkPlayback)}
              onOpen={onExpandBenchmark}
              hapticFeedback={hapticFeedback}
            />
          )}
          {compact && compactBenchmarkHasMedia && (
            <CompactTakeClearButton
              label="Best Take"
              onClear={clearCompactBenchmark}
              hapticFeedback={hapticFeedback}
            />
          )}
        </div>

        <div
          ref={challengerDropRef}
          className={`app-pip-slot pointer-events-auto ${
            compact ? 'compact-take-slot compact-take-slot--current' : ''
          }`}
          data-tutorial="challenger-card"
        >
          <PipWindow
            compact={compact}
            src={challengerTake?.videoUrl ?? null}
          filePath={challengerTake?.filePath}
          mimeType={
            challengerTake?.videoMimeType ??
            (challengerTake?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
          }
          takeName={challengerTake?.name}
          label="Current Take"
          variant="challenger"
          emptyMessage="Load a take from the vault."
          mirror={challengerTake?.mirrorPlayback === true}
          recordingOrientation={challengerTake?.recordingOrientation}
          suspendPlayback={suspendPipPlayback}
          videoRef={challengerPipVideoRef}
          onUnpin={onUnpinChallenger}
          onExpand={takeHasPlaybackMedia(challengerTake) ? onExpandChallenger : undefined}
          dropHighlight={benchmarkGhost?.overPin ?? false}
          dragSourceActive={challengerDragging}
          dragSourceArming={challengerArming}
          dragSourceProps={
            takeHasPlaybackMedia(challengerTake) ? challengerDragSourceProps : undefined
          }
          onPlaybackChange={onChallengerPlaybackChange}
          autoPlayRequestId={challengerAutoPlayRequestId}
          takeId={challengerTake?.id ?? null}
          onAutoPlayComplete={onChallengerAutoPlayComplete}
          showPinAsBest={showPinCurrentAsBest}
          onPinAsBest={onPinCurrentAsBest}
          posterUrl={
            challengerTake?.thumbnailUrl ??
            (challengerTake?.mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : null)
          }
          />
          {compact && (
            <CompactTakeCaption
              label="Current Take"
              tone="current"
              name={challengerTake?.name ?? 'No current take'}
              timestamp={challengerTake?.timestamp}
              duration={challengerTake?.duration}
              hasMedia={takeHasPlaybackMedia(challengerTake)}
              onOpen={onExpandChallenger}
              hapticFeedback={hapticFeedback}
            />
          )}
          {compact && takeHasPlaybackMedia(challengerTake) && (
            <CompactTakeClearButton
              label="Current Take"
              onClear={onUnpinChallenger}
              hapticFeedback={hapticFeedback}
            />
          )}
        </div>
      </div>

      {challengerGhost && challengerTake && (
        <PipDragGhost
          take={challengerTake}
          x={challengerGhost.x}
          y={challengerGhost.y}
          overDelete={challengerGhost.overDelete}
        />
      )}

      {benchmarkGhost && benchmarkTake && (
        <PipDragGhost
          take={benchmarkTake}
          x={benchmarkGhost.x}
          y={benchmarkGhost.y}
          overDelete={benchmarkGhost.overDelete}
          actionLabel="Current"
        />
      )}
    </>
  )
})
