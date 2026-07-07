import { useRef, type RefObject } from 'react'
import BestTakeBox from './BestTakeBox'
import LiveCameraBackground from './LiveCameraBackground'
import PipWindow from './PipWindow'
import { PipDragGhost } from './PipCompareRow'
import SplitRatioDragHandle from './SplitRatioDragHandle'
import { useDragToPin, type PipDragUiState } from '../hooks/useDragToPin'
import type { RecordingMode, Take } from '../types'
import type { LibraryPlaybackReference } from '../types/library'
import { takeHasPlaybackMedia } from '../utils/takes'
import { AUDIO_TAKE_THUMBNAIL } from '../utils/mediaType'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'

interface SplitCompareLayoutProps {
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  benchmarkTake: Take | null
  libraryBenchmarkPlayback: LibraryPlaybackReference | null
  challengerTake: Take | null
  youtubeEmbedUrl: string | null
  suspendPipPlayback: boolean
  benchmarkPipVideoRef: RefObject<HTMLMediaElement | null>
  challengerPipVideoRef: RefObject<HTMLMediaElement | null>
  splitPreviewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  cameraNeedsPermission: boolean
  recordingMode: RecordingMode
  isRecording: boolean
  cameraReady: boolean
  cameraResumeNonce?: number
  nativeLivePreviewActive?: boolean
  nativeCameraBridgeEnabled?: boolean
  nativeLivePreviewSeedUrl?: string | null
  holdPreviewForTakePlayback?: boolean
  pitchStageActive: boolean
  metronomeStageActive: boolean
  onUnpinBenchmark: () => void
  onClearLibraryReference?: () => void
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
  onPinChallenger?: (takeId: string) => void
  onDeleteTake?: (takeId: string) => void
  onDragStateChange?: (state: PipDragUiState) => void
  hapticFeedback?: boolean
}

export default function SplitCompareLayout({
  splitRatio,
  onSplitRatioChange,
  benchmarkTake,
  libraryBenchmarkPlayback,
  challengerTake,
  youtubeEmbedUrl,
  suspendPipPlayback,
  benchmarkPipVideoRef,
  challengerPipVideoRef,
  splitPreviewRef,
  streamRef,
  streamGeneration,
  cameraNeedsPermission,
  recordingMode,
  isRecording,
  cameraReady,
  cameraResumeNonce = 0,
  nativeLivePreviewActive = false,
  nativeCameraBridgeEnabled = false,
  nativeLivePreviewSeedUrl = null,
  holdPreviewForTakePlayback = false,
  pitchStageActive,
  metronomeStageActive,
  onUnpinBenchmark,
  onClearLibraryReference,
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
  onPinChallenger,
  onDeleteTake,
  onDragStateChange,
  hapticFeedback = true,
}: SplitCompareLayoutProps) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const benchmarkDropRef = useRef<HTMLDivElement>(null)
  const challengerDropRef = useRef<HTMLDivElement>(null)
  const bottomHeight = 100 - splitRatio
  const showCurrentTake = takeHasPlaybackMedia(challengerTake) && !isRecording
  const challengerDragEnabled = showCurrentTake && Boolean(onPinBenchmark)
  const benchmarkDragEnabled =
    !isRecording &&
    Boolean(onPinChallenger) &&
    takeHasPlaybackMedia(benchmarkTake) &&
    !libraryBenchmarkPlayback &&
    !youtubeEmbedUrl

  const {
    ghost: challengerGhost,
    isDragging: challengerDragging,
    isArming: challengerArming,
    dragSourceProps: challengerDragSourceProps,
  } = useDragToPin({
    sourceTakeId: challengerTake?.id ?? null,
    dropTargetRef: benchmarkDropRef,
    deleteDropTargetRef: deleteDropRef,
    onPin: onPinBenchmark ?? (() => {}),
    onDelete: onDeleteTake,
    onTap: onExpandChallenger,
    onDragStateChange,
    enabled: challengerDragEnabled,
    hapticFeedback,
  })

  const {
    ghost: benchmarkGhost,
    isDragging: benchmarkDragging,
    isArming: benchmarkArming,
    dragSourceProps: benchmarkDragSourceProps,
  } = useDragToPin({
    sourceTakeId: benchmarkTake?.id ?? null,
    dropTargetRef: challengerDropRef,
    onPin: onPinChallenger ?? (() => {}),
    onTap: onExpandBenchmark,
    onDragStateChange,
    enabled: benchmarkDragEnabled,
    hapticFeedback,
  })

  const currentPanelLabel = isRecording
    ? 'Recording…'
    : recordingMode === 'audio'
      ? 'Audio Recording'
      : 'Current Camera'

  const benchmarkIsAudio =
    libraryBenchmarkPlayback != null ||
    benchmarkTake?.mediaType === 'audio' ||
    benchmarkTake?.videoMimeType?.startsWith('audio/') === true

  const challengerIsAudio =
    challengerTake?.mediaType === 'audio' ||
    challengerTake?.videoMimeType?.startsWith('audio/') === true

  return (
    <>
      <div ref={layoutRef} className="split-compare-layout flex h-full w-full min-h-0 flex-col">
        <div
          className="split-compare-layout__top relative min-h-0 w-full shrink-0"
          style={{ height: `${splitRatio}%` }}
        >
          <div
            ref={benchmarkDropRef}
            className={`split-compare-panel split-compare-panel--best h-full w-full min-h-0${
              benchmarkIsAudio ? ' split-compare-panel--media-audio' : ''
            }`}
          >
            <span className="split-compare-panel__label split-compare-panel__label--best">
              Best Take
            </span>
            <BestTakeBox
              layout="fill"
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
              splitViewActive
              onExpand={onExpandBenchmark}
              onPlaybackChange={onBenchmarkPlaybackChange}
              onYoutubeHostChange={onYoutubeHostChange}
              youtubeIframeRef={youtubeIframeRef}
              dragSourceActive={benchmarkDragging}
              dragSourceArming={benchmarkArming}
              dragSourceProps={benchmarkDragEnabled ? benchmarkDragSourceProps : undefined}
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
          className="split-compare-layout__bottom relative flex min-h-0 w-full shrink-0 flex-col"
          style={{ height: `${bottomHeight}%` }}
        >
          {showCurrentTake && challengerTake ? (
            <div ref={challengerDropRef} className={`split-compare-panel split-compare-panel--current split-compare-layout__bottom-inner h-full w-full min-h-0${
              challengerIsAudio ? ' split-compare-panel--media-audio' : ''
            }`}>
              <span className="split-compare-panel__label split-compare-panel__label--current">
                Current Take
              </span>
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
                dropHighlight={benchmarkGhost?.overPin ?? false}
                dragSourceActive={challengerDragging}
                dragSourceArming={challengerArming}
                dragSourceProps={challengerDragEnabled ? challengerDragSourceProps : undefined}
                splitViewActive
                posterUrl={
                  challengerTake.thumbnailUrl ??
                  (challengerIsAudio ? AUDIO_TAKE_THUMBNAIL : null)
                }
              />
            </div>
          ) : (
            <div
              ref={challengerDropRef}
              className={`split-compare-panel split-compare-panel--current h-full w-full min-h-0${
                benchmarkGhost?.overPin ? ' pip-drop-target--active' : ''
              }`}
            >
              <span className="split-compare-panel__label split-compare-panel__label--current">
                {currentPanelLabel}
              </span>
              <div className="relative h-full w-full min-h-0 overflow-hidden">
                <LiveCameraBackground
                  variant="embedded"
                  previewRef={splitPreviewRef}
                  streamRef={streamRef}
                  streamGeneration={streamGeneration}
                  recordingMode={recordingMode}
                  isRecording={isRecording}
                  resumeNonce={cameraResumeNonce}
                  modePreparing={!cameraReady && !isRecording && !cameraNeedsPermission}
                  nativeLivePreviewActive={nativeLivePreviewActive}
                  nativeCameraBridgeEnabled={nativeCameraBridgeEnabled}
                  nativeLivePreviewSeedUrl={nativeLivePreviewSeedUrl}
                  holdPreviewForTakePlayback={holdPreviewForTakePlayback}
                  pitchStageActive={pitchStageActive}
                  metronomeStageActive={metronomeStageActive}
                />
              </div>
            </div>
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
}
