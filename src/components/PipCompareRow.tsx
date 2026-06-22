import { useRef, type RefObject } from 'react'
import BestTakeBox from './BestTakeBox'
import PipWindow from './PipWindow'
import { useDragToPin, type PipDragUiState } from '../hooks/useDragToPin'
import type { Take } from '../types'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'
import { takeHasPlaybackMedia } from '../utils/takes'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'

interface PipCompareRowProps {
  benchmarkTake: Take | null
  challengerTake: Take | null
  youtubeEmbedUrl: string | null
  suspendPipPlayback: boolean
  benchmarkPipVideoRef: RefObject<HTMLMediaElement | null>
  challengerPipVideoRef: RefObject<HTMLMediaElement | null>
  deleteDropRef: RefObject<HTMLElement | null>
  onPinBenchmark: (takeId: string) => void
  onDeleteTake: (takeId: string) => void
  onUnpinBenchmark: () => void
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
}

function PipDragGhost({
  take,
  x,
  y,
  overDelete,
}: {
  take: Take
  x: number
  y: number
  overDelete: boolean
}) {
  const poster =
    take.thumbnailUrl ||
    (take.mediaType === 'audio' ? AUDIO_TAKE_THUMBNAIL : undefined)

  return (
    <div
      className="pip-drag-ghost pointer-events-none fixed z-[60]"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
      }}
      aria-hidden
    >
      <div
        className={`pip-drag-ghost-inner ui-orient-spin overflow-hidden rounded-xl border bg-stone-900 shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-2 ${
          overDelete
            ? 'border-red-400/70 ring-red-400/50'
            : 'border-sky-400/60 ring-sky-400/40'
        }`}
      >
        {poster ? (
          <img
            src={poster}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full bg-stone-800" />
        )}
        <span
          className={`absolute bottom-1 left-1 rounded px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-white ${
            overDelete ? 'bg-red-500/90' : 'bg-sky-500/90'
          }`}
        >
          {overDelete ? 'Delete' : 'Pin'}
        </span>
      </div>
    </div>
  )
}

export default function PipCompareRow({
  benchmarkTake,
  challengerTake,
  youtubeEmbedUrl,
  suspendPipPlayback,
  benchmarkPipVideoRef,
  challengerPipVideoRef,
  deleteDropRef,
  onPinBenchmark,
  onDeleteTake,
  onUnpinBenchmark,
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
}: PipCompareRowProps) {
  const benchmarkDropRef = useRef<HTMLDivElement>(null)

  const { ghost, isDragging, isArming, dragSourceProps } = useDragToPin({
    sourceTakeId: challengerTake?.id ?? null,
    dropTargetRef: benchmarkDropRef,
    deleteDropTargetRef: deleteDropRef,
    onPin: onPinBenchmark,
    onDelete: onDeleteTake,
    onTap: onExpandChallenger,
    onDragStateChange,
    enabled: takeHasPlaybackMedia(challengerTake),
    hapticFeedback,
  })

  return (
    <>
      <div className="app-pip-row">
        <div ref={benchmarkDropRef} className="pointer-events-auto shrink-0">
          <BestTakeBox
            layout="pip"
            take={benchmarkTake}
            youtubeEmbedUrl={youtubeEmbedUrl}
            suspendPlayback={suspendPipPlayback}
            videoRef={benchmarkPipVideoRef}
            dropHighlight={ghost?.overPin ?? false}
            onUnpinTake={onUnpinBenchmark}
            onClearYoutube={onClearYoutube}
            onSubmitYoutube={onSubmitYoutube}
            onUpload={onUploadBenchmark}
            onToggleSplitView={onToggleSplitView}
            onExpand={takeHasPlaybackMedia(benchmarkTake) ? onExpandBenchmark : undefined}
            onPlaybackChange={onBenchmarkPlaybackChange}
          />
        </div>

        <PipWindow
          className="pointer-events-auto shrink-0"
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
          mirror={challengerTake?.mirrorPlayback !== false}
          recordingOrientation={challengerTake?.recordingOrientation}
          suspendPlayback={suspendPipPlayback}
          videoRef={challengerPipVideoRef}
          onUnpin={onUnpinChallenger}
          onExpand={takeHasPlaybackMedia(challengerTake) ? onExpandChallenger : undefined}
          dragSourceActive={isDragging}
          dragSourceArming={isArming}
          dragSourceProps={
            takeHasPlaybackMedia(challengerTake) ? dragSourceProps : undefined
          }
          onPlaybackChange={onChallengerPlaybackChange}
          autoPlayRequestId={challengerAutoPlayRequestId}
          takeId={challengerTake?.id ?? null}
          onAutoPlayComplete={onChallengerAutoPlayComplete}
          showPinAsBest={showPinCurrentAsBest}
          onPinAsBest={onPinCurrentAsBest}
        />
      </div>

      {ghost && challengerTake && (
        <PipDragGhost
          take={challengerTake}
          x={ghost.x}
          y={ghost.y}
          overDelete={ghost.overDelete}
        />
      )}
    </>
  )
}
