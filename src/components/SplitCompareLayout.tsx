import type { RefObject } from 'react'
import BestTakeBox from './BestTakeBox'
import LiveCameraBackground from './LiveCameraBackground'
import type { RecordingMode, Take } from '../types'

interface SplitCompareLayoutProps {
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  benchmarkTake: Take | null
  youtubeEmbedUrl: string | null
  suspendPipPlayback: boolean
  benchmarkPipVideoRef: RefObject<HTMLMediaElement | null>
  splitPreviewRef: RefObject<HTMLVideoElement | null>
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  cameraError: string | null
  recordingMode: RecordingMode
  isRecording: boolean
  cameraReady: boolean
  pitchStageActive: boolean
  onUnpinBenchmark: () => void
  onClearYoutube: () => void
  onLoadYoutube: () => void
  onUploadBenchmark: (file: File) => void
  onToggleSplitView: () => void
  onExpandBenchmark?: () => void
  onBenchmarkPlaybackChange?: (playing: boolean) => void
}

export default function SplitCompareLayout({
  splitRatio,
  onSplitRatioChange,
  benchmarkTake,
  youtubeEmbedUrl,
  suspendPipPlayback,
  benchmarkPipVideoRef,
  splitPreviewRef,
  streamRef,
  streamGeneration,
  cameraError,
  recordingMode,
  isRecording,
  cameraReady,
  pitchStageActive,
  onUnpinBenchmark,
  onClearYoutube,
  onLoadYoutube,
  onUploadBenchmark,
  onToggleSplitView,
  onExpandBenchmark,
  onBenchmarkPlaybackChange,
}: SplitCompareLayoutProps) {
  const bottomHeight = 100 - splitRatio

  return (
    <div className="split-compare-layout flex h-full w-full min-h-0 flex-col">
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
          onLoadYoutube={onLoadYoutube}
          onUpload={onUploadBenchmark}
          onToggleSplitView={onToggleSplitView}
          splitViewActive
          onExpand={onExpandBenchmark}
          onPlaybackChange={onBenchmarkPlaybackChange}
        />
      </div>

      <input
        type="range"
        min={20}
        max={80}
        value={splitRatio}
        onChange={(e) => onSplitRatioChange(Number(e.target.value))}
        className="split-ratio-slider pointer-events-auto w-full shrink-0"
        aria-label="Adjust split view ratio"
      />

      <div
        className="split-compare-layout__bottom relative min-h-0 w-full shrink-0 overflow-hidden rounded-xl border border-white/15 bg-stone-900/95 ring-1 ring-sky-400/50"
        style={{ height: `${bottomHeight}%` }}
      >
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-sky-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          {recordingMode === 'audio' ? 'Audio Recording' : 'Current Camera'}
        </span>
        <div className="relative h-full w-full overflow-hidden">
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
      </div>
    </div>
  )
}
