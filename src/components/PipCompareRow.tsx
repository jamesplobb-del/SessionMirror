import { useRef, type RefObject } from 'react'
import PipWindow from './PipWindow'
import { useDragToPin } from '../hooks/useDragToPin'
import type { Take } from '../types'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'

interface PipCompareRowProps {
  benchmarkTake: Take | null
  challengerTake: Take | null
  suspendPipPlayback: boolean
  benchmarkPipVideoRef: RefObject<HTMLMediaElement | null>
  challengerPipVideoRef: RefObject<HTMLMediaElement | null>
  onPinBenchmark: (takeId: string) => void
  onUnpinBenchmark: () => void
  onUnpinChallenger: () => void
  onUploadBenchmark: (file: File) => void
  onExpandBenchmark?: () => void
  onExpandChallenger?: () => void
  hapticFeedback?: boolean
}

function PipDragGhost({
  take,
  x,
  y,
}: {
  take: Take
  x: number
  y: number
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
      <div className="pip-drag-ghost-inner overflow-hidden rounded-xl border border-sky-400/60 bg-stone-900 shadow-[0_8px_32px_rgba(0,0,0,0.55)] ring-2 ring-sky-400/40">
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
        <span className="absolute bottom-1 left-1 rounded bg-sky-500/90 px-1 py-px text-[7px] font-semibold uppercase tracking-wide text-white">
          Pin
        </span>
      </div>
    </div>
  )
}

export default function PipCompareRow({
  benchmarkTake,
  challengerTake,
  suspendPipPlayback,
  benchmarkPipVideoRef,
  challengerPipVideoRef,
  onPinBenchmark,
  onUnpinBenchmark,
  onUnpinChallenger,
  onUploadBenchmark,
  onExpandBenchmark,
  onExpandChallenger,
  hapticFeedback = true,
}: PipCompareRowProps) {
  const benchmarkDropRef = useRef<HTMLDivElement>(null)

  const { ghost, isDragging, isArming, dragSourceProps } = useDragToPin({
    sourceTakeId: challengerTake?.id ?? null,
    dropTargetRef: benchmarkDropRef,
    onPin: onPinBenchmark,
    onTap: onExpandChallenger,
    enabled: Boolean(challengerTake?.videoUrl),
    hapticFeedback,
  })

  return (
    <>
      <div className="app-pip-row">
        <div ref={benchmarkDropRef} className="pointer-events-auto shrink-0">
          <PipWindow
            src={benchmarkTake?.videoUrl ?? null}
            filePath={benchmarkTake?.filePath}
            mimeType={benchmarkTake?.videoMimeType ?? 'video/mp4'}
            takeName={benchmarkTake?.name}
            label="Best Take"
            variant="benchmark"
            emptyMessage="Drag Current Take here or upload."
            mirror={benchmarkTake?.mirrorPlayback !== false}
            suspendPlayback={suspendPipPlayback}
            videoRef={benchmarkPipVideoRef}
            onUnpin={onUnpinBenchmark}
            onUpload={onUploadBenchmark}
            onExpand={benchmarkTake?.videoUrl ? onExpandBenchmark : undefined}
            dropHighlight={ghost?.overTarget ?? false}
          />
        </div>

        <PipWindow
          className="pointer-events-auto shrink-0"
          src={challengerTake?.videoUrl ?? null}
          filePath={challengerTake?.filePath}
          mimeType={challengerTake?.videoMimeType ?? 'video/mp4'}
          takeName={challengerTake?.name}
          label="Current Take"
          variant="challenger"
          emptyMessage="Load a take from the vault."
          mirror={challengerTake?.mirrorPlayback !== false}
          suspendPlayback={suspendPipPlayback}
          videoRef={challengerPipVideoRef}
          onUnpin={onUnpinChallenger}
          onExpand={challengerTake?.videoUrl ? onExpandChallenger : undefined}
          dragSourceActive={isDragging}
          dragSourceArming={isArming}
          dragSourceProps={
            challengerTake?.videoUrl ? dragSourceProps : undefined
          }
        />
      </div>

      {ghost && challengerTake && (
        <PipDragGhost take={challengerTake} x={ghost.x} y={ghost.y} />
      )}
    </>
  )
}
