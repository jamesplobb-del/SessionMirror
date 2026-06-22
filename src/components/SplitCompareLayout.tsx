import { useRef, type RefObject } from 'react'
import BestTakeBox from './BestTakeBox'
import LiveCameraBackground from './LiveCameraBackground'
import PipWindow from './PipWindow'
import SplitRatioDragHandle from './SplitRatioDragHandle'
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
  cameraError: string | null
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
  cameraError,
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
}: SplitCompareLayoutProps) {
  const layoutRef = useRef<HTMLDivElement>(null)
  const bottomHeight = 100 - splitRatio
  const showCurrentTake = takeHasPlaybackMedia(challengerTake) && !isRecording

  return (
    <div ref={layoutRef} className="split-compare-layout flex h-full w-full min-h-0 flex-col">
      <div
        className="split-compare-layout__top relative min-h-0 w-full shrink-0 overflow-hidden"
        style={{ height: `${splitRatio}%` }}
      >
        <BestTakeBox
          layout="fill"
          take={benchmarkTake}
          youtubeEmbedUrl={youtubeEmbedUrl}
          suspendPlayback={suspendPipPlayback}
          videoRef={benchmarkPipVideoRef}
          onUnpinTake={onUnpinBenchmark}
          onClearYoutube={onClearYoutube}
          onSubmitYoutube={onSubmitYoutube}
          onUpload={onUploadBenchmark}
          onToggleSplitView={onToggleSplitView}
          splitViewActive
          onExpand={onExpandBenchmark}
          onPlaybackChange={onBenchmarkPlaybackChange}
          onYoutubeHostChange={onYoutubeHostChange}
        />
      </div>

      <SplitRatioDragHandle
        ratio={splitRatio}
        onChange={onSplitRatioChange}
        layoutRef={layoutRef}
      />

      <div
        className="split-compare-layout__bottom relative flex min-h-0 w-full shrink-0 flex-col border-t border-white/10 bg-black/40 backdrop-blur-xl ring-1 ring-amber-500/30"
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
            />
          </div>
        ) : (
          <>
            <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-100">
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
                error={cameraError}
                recordingMode={recordingMode}
                isRecording={isRecording}
                modePreparing={!cameraReady && !isRecording}
                pitchStageActive={pitchStageActive}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
