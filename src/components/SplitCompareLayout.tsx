import { useRef, type RefObject } from 'react'
import BestTakeBox from './BestTakeBox'
import LiveCameraBackground from './LiveCameraBackground'
import PipWindow from './PipWindow'
import { PipDragGhost } from './PipCompareRow'
import SplitRatioDragHandle from './SplitRatioDragHandle'
import { useDragToPin, type PipDragUiState } from '../hooks/useDragToPin'
import type { RecordingMode, Take } from '../types'
import { takeHasPlaybackMedia } from '../utils/takes'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'

interface SplitCompareLayoutProps {
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  benchmarkTake: Take | null
  challengerTake: Take | null
  youtubeEmbedUrl: string | null
  suspendPipPlayback: boolean
  benchmarkPipVideoRef: RefObject<HTMLMediaElement | null>
  challengerPipVideoRef: RefObject<HTMLMediaElement | null>
  splitPreviewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  cameraNeedsPermission: boolean
  onRequestCameraAccess: () => void
  recordingMode: RecordingMode
  isRecording: boolean
  cameraReady: boolean
  pitchStageActive: boolean
  onUnpinBenchmark: () => void
  onUnpinChallenger: () => void
  onClearYoutube: () => void
  onSubmitYoutube: (embedUrl: string) => void
  onUploadBenchmark: (file: File) => void
  onToggleSplitView: () => void
  onExpandBenchmark?: () => void
  onExpandChallenger?: () => void
  onBenchmarkPlaybackChange?: (playing: boolean) => void
  onChallengerPlaybackChange?: (playing: boolean) => void
  challengerAutoPlayRequestId?: string | null
  onChallengerAutoPlayComplete?: () => void
  showPinCurrentAsBest?: boolean
  onPinCurrentAsBest?: () => void
  onYoutubeHostChange?: (el: HTMLDivElement | null) => void
  youtubeIframeRef?: RefObject<HTMLIFrameElement | null>
  deleteDropRef?: RefObject<HTMLElement | null>
  onPinBenchmark?: (takeId: string) => void
  onDeleteTake?: (takeId: string) => void
  onDragStateChange?: (state: PipDragUiState) => void
  hapticFeedback?: boolean
}

export default function SplitCompareLayout({
  splitRatio,
  onSplitRatioChange,
  benchmarkTake,
  challengerTake,
  youtubeEmbedUrl,
  suspendPipPlayback,
  benchmarkPipVideoRef,
  challengerPipVideoRef,
  splitPreviewRef,
  streamRef,
  streamGeneration,
  cameraNeedsPermission,
  onRequestCameraAccess,
  recordingMode,
  isRecording,
  cameraReady,
  pitchStageActive,
  onUnpinBenchmark,
  onUnpinChallenger,
  onClearYoutube,
  onSubmitYoutube,
  onUploadBenchmark,
  onToggleSplitView,
  onExpandBenchmark,
  onExpandChallenger,
  onBenchmarkPlaybackChange,
  onChallengerPlaybackChange,
  challengerAutoPlayRequestId = null,
  onChallengerAutoPlayComplete,
  showPinCurrentAsBest = false,
  onPinCurrentAsBest,
  onYoutubeHostChange,
  youtubeIframeRef,
  deleteDropRef,
  onPinBenchmark,
  onDeleteTake,
  onDragStateChange,
  hapticFeedback = true,
}: SplitCompareLayoutProps) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const benchmarkDropRef = useRef<HTMLDivElement>(null)
  const bottomHeight = 100 - splitRatio
  const showCurrentTake = takeHasPlaybackMedia(challengerTake) && !isRecording
  const dragEnabled = showCurrentTake && Boolean(onPinBenchmark)

  const { ghost, isDragging, isArming, dragSourceProps } = useDragToPin({
    sourceTakeId: challengerTake?.id ?? null,
    dropTargetRef: benchmarkDropRef,
    deleteDropTargetRef: deleteDropRef,
    onPin: onPinBenchmark ?? (() => {}),
    onDelete: onDeleteTake,
    onTap: onExpandChallenger,
    onDragStateChange,
    enabled: dragEnabled,
    hapticFeedback,
  })

  return (
    <>
      <div ref={layoutRef} className="split-compare-layout flex h-full w-full min-h-0 flex-col">
        <div
          className="split-compare-layout__top relative min-h-0 w-full shrink-0 overflow-hidden"
          style={{ height: `${splitRatio}%` }}
        >
          <div ref={benchmarkDropRef} className="h-full w-full min-h-0">
            <BestTakeBox
              layout="fill"
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
              splitViewActive
              onExpand={onExpandBenchmark}
              onPlaybackChange={onBenchmarkPlaybackChange}
              onYoutubeHostChange={onYoutubeHostChange}
              youtubeIframeRef={youtubeIframeRef}
            />
          </div>
        </div>

        <SplitRatioDragHandle
          ratio={splitRatio}
          onChange={onSplitRatioChange}
          layoutRef={layoutRef}
          hapticFeedback={hapticFeedback}
        />

        <div
          className="split-compare-layout__bottom relative flex min-h-0 w-full shrink-0 flex-col overflow-hidden bg-black/95 ring-1 ring-sky-400/50"
          style={{ height: `${bottomHeight}%` }}
        >
          {showCurrentTake && challengerTake ? (
            <div className="split-compare-layout__bottom-inner relative flex h-full w-full min-h-0 flex-1 flex-col">
              <PipWindow
                layout="fill"
                className="h-full w-full min-h-0 flex-1"
                src={challengerTake.videoUrl}
                filePath={challengerTake.filePath}
                mimeType={
                  challengerTake.videoMimeType ??
                  (challengerTake.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
                }
                takeName={challengerTake.name}
                label="Current Take"
                variant="challenger"
                emptyMessage="Record a take to compare."
                mirror={challengerTake.mirrorPlayback !== false}
                recordingOrientation={challengerTake.recordingOrientation}
                suspendPlayback={suspendPipPlayback}
                videoRef={challengerPipVideoRef}
                onUnpin={onUnpinChallenger}
                onExpand={onExpandChallenger}
                onPlaybackChange={onChallengerPlaybackChange}
                autoPlayRequestId={challengerAutoPlayRequestId}
                takeId={challengerTake.id}
                onAutoPlayComplete={onChallengerAutoPlayComplete}
                showPinAsBest={showPinCurrentAsBest}
                onPinAsBest={onPinCurrentAsBest}
                dragSourceActive={isDragging}
                dragSourceArming={isArming}
                dragSourceProps={dragEnabled ? dragSourceProps : undefined}
              />
            </div>
          ) : (
            <>
              <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-sky-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                {isRecording
                  ? 'Recording…'
                  : recordingMode === 'audio'
                    ? 'Audio Recording'
                    : 'Current Camera'}
              </span>
              <div className="relative h-full w-full min-h-0 overflow-hidden">
                <LiveCameraBackground
                  variant="embedded"
                  previewRef={splitPreviewRef}
                  streamRef={streamRef}
                  streamGeneration={streamGeneration}
                  needsPermission={cameraNeedsPermission}
                  onRequestPermission={onRequestCameraAccess}
                  recordingMode={recordingMode}
                  isRecording={isRecording}
                  modePreparing={!cameraReady && !isRecording && !cameraNeedsPermission}
                  pitchStageActive={pitchStageActive}
                />
              </div>
            </>
          )}
        </div>
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
