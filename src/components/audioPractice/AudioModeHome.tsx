import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { motion } from 'framer-motion'
import { Star, X } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useAudioModeTakeItem } from '../../hooks/useAudioModeTakeItem'
import { useLiveRecordingWaveform } from '../../hooks/useLiveRecordingWaveform'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { useRecordWash } from '../../hooks/useRecordWash'
import { useWrittenTakeWaveform } from '../../hooks/useWrittenTakeWaveform'
import { stopEventBubble } from '../../utils/eventBubbling'
import { triggerDragStartHaptic, triggerLightHaptic } from '../../utils/haptics'
import { iosHudDim, motionGpuLayer } from '../../utils/motionPresets'
import type { RecordWashMode } from '../../utils/recordWash'
import type { Take } from '../../types'
import type { LibraryPlaybackReference } from '../../types/library'

const MIN_VISIBLE_WAVEFORM_PEAK = 0.02
const HEARING_ENERGY = 0.14
const STAGE_BARS = 96

interface RibbonPoint {
  x: number
  y: number
}

function smoothPath(points: RibbonPoint[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`
  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]
    const next = points[index + 1]
    const midpointX = (current.x + next.x) / 2
    const midpointY = (current.y + next.y) / 2
    path += ` Q ${current.x.toFixed(1)},${current.y.toFixed(1)} ${midpointX.toFixed(1)},${midpointY.toFixed(1)}`
  }
  const last = points[points.length - 1]
  path += ` T ${last.x.toFixed(1)},${last.y.toFixed(1)}`
  return path
}

function createRibbonPath(peaks: number[], widthRatio = 1): string {
  if (peaks.length === 0) return ''
  const width = 1000 * Math.max(0.04, Math.min(1, widthRatio))
  const centerY = 90
  const maxAmplitude = 52
  const smoothedPeaks = peaks.map((peak, index) => {
    const previous = peaks[Math.max(0, index - 1)]
    const next = peaks[Math.min(peaks.length - 1, index + 1)]
    return previous * 0.24 + peak * 0.52 + next * 0.24
  })
  const sampledPeaks = smoothedPeaks.filter((_, index) => index % 2 === 0)
  if ((smoothedPeaks.length - 1) % 2 !== 0) sampledPeaks.push(smoothedPeaks.at(-1) ?? 0)

  const points = sampledPeaks.map((peak, index) => {
    const progress = index / Math.max(1, sampledPeaks.length - 1)
    const taper = 0.22 + Math.pow(Math.sin(progress * Math.PI), 0.8) * 0.78
    const energy = Math.max(MIN_VISIBLE_WAVEFORM_PEAK, peak)
    const direction =
      Math.sin(index * 1.37 + progress * Math.PI * 0.7 + 0.4) * 0.66 +
      Math.sin(index * 0.58 + 1.2) * 0.34
    return {
      x: 22 + progress * (width - 44),
      y: centerY + direction * energy * maxAmplitude * taper,
    }
  })
  return smoothPath(points)
}

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '00:00'
  const rounded = Math.max(0, Math.round(seconds))
  const mins = Math.floor(rounded / 60)
  const secs = rounded % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

type ScrubPhase = 'start' | 'move' | 'end'

function RecordStageRibbon({
  currentPeaks,
  bestPeaks,
  widthRatio,
  playhead,
  recording,
  playing,
  activeTone,
  onScrub,
  disabled,
  hapticFeedback,
}: {
  currentPeaks: number[]
  bestPeaks: number[]
  widthRatio: number
  playhead: number
  recording: boolean
  playing: boolean
  activeTone: 'current' | 'best' | 'live'
  onScrub: (progress: number, phase: ScrubPhase) => void
  disabled: boolean
  hapticFeedback: boolean
}) {
  const [dragProgress, setDragProgress] = useState<number | null>(null)
  const hapticMilestoneRef = useRef(-1)
  const displayedProgress = dragProgress ?? playhead
  const currentPath = useMemo(
    () => createRibbonPath(currentPeaks, widthRatio),
    [currentPeaks, widthRatio],
  )
  const bestPath = useMemo(() => createRibbonPath(bestPeaks, 1), [bestPeaks])
  const writeHeadX = 22 + widthRatio * 956
  const playheadX = 22 + displayedProgress * 956
  const currentThick = activeTone !== 'best'
  const bestThick = activeTone === 'best'

  const updateDragProgress = (
    clientX: number,
    rect: DOMRect,
    phase: ScrubPhase,
  ) => {
    const nextProgress = rect.width > 0
      ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      : displayedProgress
    setDragProgress(nextProgress)
    onScrub(nextProgress, phase)
    if (phase !== 'move' || !hapticFeedback) return
    const milestone = Math.floor(nextProgress * 4)
    if (milestone !== hapticMilestoneRef.current) {
      hapticMilestoneRef.current = milestone
      triggerLightHaptic(true)
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    hapticMilestoneRef.current = -1
    if (hapticFeedback) void triggerDragStartHaptic()
    updateDragProgress(event.clientX, event.currentTarget.getBoundingClientRect(), 'start')
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    updateDragProgress(event.clientX, event.currentTarget.getBoundingClientRect(), 'move')
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateDragProgress(event.clientX, event.currentTarget.getBoundingClientRect(), 'end')
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragProgress(null)
    hapticMilestoneRef.current = -1
    triggerLightHaptic(hapticFeedback)
    event.stopPropagation()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const step = event.shiftKey ? 0.1 : 0.025
    let nextProgress: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      nextProgress = Math.max(0, displayedProgress - step)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      nextProgress = Math.min(1, displayedProgress + step)
    } else if (event.key === 'Home') {
      nextProgress = 0
    } else if (event.key === 'End') {
      nextProgress = 1
    }
    if (nextProgress === null) return
    event.preventDefault()
    event.stopPropagation()
    onScrub(nextProgress, 'start')
    onScrub(nextProgress, 'end')
    triggerLightHaptic(hapticFeedback)
  }

  return (
    <div
      className={`audio-record-ribbon ${recording ? 'audio-record-ribbon--recording' : ''} ${
        playing ? 'audio-record-ribbon--playing' : ''
      } ${disabled ? 'audio-record-ribbon--disabled' : ''}`}
      role={disabled ? 'img' : 'slider'}
      aria-label={recording ? 'Recording waveform' : 'Take waveform'}
      aria-valuemin={disabled ? undefined : 0}
      aria-valuemax={disabled ? undefined : 100}
      aria-valuenow={disabled ? undefined : Math.round(displayedProgress * 100)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={handleKeyDown}
      onClick={stopEventBubble}
    >
      <svg className="audio-record-ribbon__canvas" viewBox="0 0 1000 180" preserveAspectRatio="none">
        {recording ? (
          <line
            className="audio-record-ribbon__baseline"
            x1="22"
            y1="90"
            x2="978"
            y2="90"
          />
        ) : null}
        {bestPath ? (
          <path
            className={`audio-record-ribbon__ghost ${bestThick ? 'audio-record-ribbon__ghost--active' : ''}`}
            d={bestPath}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {currentPath ? (
          <path
            className={`audio-record-ribbon__body audio-record-ribbon__body--${
              recording ? 'record' : currentThick ? 'current' : 'dim'
            }`}
            d={currentPath}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {recording ? (
          <line
            className="audio-record-ribbon__write-head"
            x1={writeHeadX}
            y1="38"
            x2={writeHeadX}
            y2="142"
          />
        ) : null}
        {(playing || dragProgress !== null) && !recording ? (
          <line
            className="audio-record-ribbon__playhead"
            x1={playheadX}
            y1="28"
            x2={playheadX}
            y2="152"
          />
        ) : null}
      </svg>
    </div>
  )
}

function RecordTraceKey({
  tone,
  label,
  playing,
  onPlay,
  onPin,
  onClear,
}: {
  tone: 'current' | 'best'
  label: string
  playing: boolean
  onPlay: () => void
  onPin?: () => void
  onClear?: () => void
}) {
  return (
    <div
      className={`audio-record-key audio-record-key--${tone} ${
        playing ? 'audio-record-key--playing' : ''
      }`}
    >
      <Pressable
        type="button"
        intensity="soft"
        squish={false}
        haptic="light"
        onClick={onPlay}
        className="audio-record-key__play"
        aria-pressed={playing}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
      >
        <span className="audio-record-key__swatch" aria-hidden />
        {label}
      </Pressable>
      {onPin ? (
        <Pressable
          type="button"
          intensity="icon"
          haptic="light"
          onClick={onPin}
          className="audio-record-key__action audio-record-key__action--pin"
          aria-label="Pin Current as Best"
        >
          <Star className="h-3 w-3 fill-current" />
        </Pressable>
      ) : null}
      {onClear ? (
        <Pressable
          type="button"
          intensity="icon"
          haptic="light"
          onClick={onClear}
          className="audio-record-key__action"
          aria-label={`Clear ${label}`}
        >
          <X className="h-3 w-3" />
        </Pressable>
      ) : null}
    </div>
  )
}

interface AudioModeHomeProps {
  isRecording: boolean
  elapsed: number
  ready: boolean
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  challengerTake: Take | null
  benchmarkTake: Take | null
  libraryBenchmarkPlayback: LibraryPlaybackReference | null
  showTakeKeys?: boolean
  onPinCurrentAsBest?: () => void
  onClearBenchmark?: () => void
  onClearChallenger?: () => void
  hapticFeedback?: boolean
}

function AudioModeHome({
  isRecording,
  elapsed,
  ready,
  streamRef,
  streamGeneration,
  challengerTake,
  benchmarkTake,
  libraryBenchmarkPlayback,
  showTakeKeys = true,
  onPinCurrentAsBest,
  onClearBenchmark,
  onClearChallenger,
  hapticFeedback = true,
}: AudioModeHomeProps) {
  const stageRef = useRef<HTMLElement | null>(null)
  const [holdWritten, setHoldWritten] = useState(false)

  const livePeaks = useLiveRecordingWaveform({
    active: ready || isRecording,
    streamRef,
    streamGeneration,
  })
  const { peaks: writtenPeaks, writeProgress, reset: resetWritten } = useWrittenTakeWaveform(
    isRecording,
    livePeaks,
  )

  const currentItem = useAudioModeTakeItem({ tone: 'current', take: challengerTake })
  const bestItem = useAudioModeTakeItem({
    tone: 'best',
    take: benchmarkTake,
    libraryPlayback: libraryBenchmarkPlayback,
  })

  const currentMediaPeaks = useMediaWaveform({
    filePath: currentItem.hasMedia ? currentItem.playbackItem?.filePath ?? '' : '',
    mediaUrl: currentItem.hasMedia ? currentItem.playbackItem?.mediaUrl ?? '' : '',
    barCount: STAGE_BARS,
    placeholder: false,
  })
  const bestMediaPeaks = useMediaWaveform({
    filePath: bestItem.hasMedia ? bestItem.playbackItem?.filePath ?? '' : '',
    mediaUrl: bestItem.hasMedia ? bestItem.playbackItem?.mediaUrl ?? '' : '',
    barCount: STAGE_BARS,
    placeholder: false,
  })

  useEffect(() => {
    if (isRecording) setHoldWritten(true)
  }, [isRecording])

  useEffect(() => {
    if (isRecording || challengerTake) return
    setHoldWritten(false)
    resetWritten()
  }, [challengerTake, isRecording, resetWritten])

  useEffect(() => {
    if (currentItem.hasMedia && currentItem.playbackItem) {
      currentItem.audioPlayback.prime(currentItem.playbackItem)
    }
  }, [currentItem.audioPlayback, currentItem.hasMedia, currentItem.playbackItem])

  useEffect(() => {
    if (bestItem.hasMedia && bestItem.playbackItem) {
      bestItem.audioPlayback.prime(bestItem.playbackItem)
    }
  }, [bestItem.audioPlayback, bestItem.hasMedia, bestItem.playbackItem])

  const liveEnergy = useMemo(() => {
    if (livePeaks.length === 0) return 0
    const tail = livePeaks.slice(-4)
    return tail.reduce((sum, peak) => sum + peak, 0) / tail.length
  }, [livePeaks])

  const listening = !isRecording && !currentItem.isPlaying && !bestItem.isPlaying && liveEnergy >= HEARING_ENERGY
  const showLiveRibbon = !isRecording && !holdWritten && !currentItem.hasMedia
  const currentPeaks = isRecording || (holdWritten && writtenPeaks.length > 0)
    ? writtenPeaks
    : currentItem.hasMedia
      ? currentMediaPeaks
      : showLiveRibbon
        ? livePeaks
        : []
  const bestPeaks = bestItem.hasMedia ? bestMediaPeaks : []
  const widthRatio = isRecording ? writeProgress : 1
  const activeTake = bestItem.isPlaying ? bestItem : currentItem
  const playhead = activeTake.isPlaying || activeTake.isCurrentItem ? activeTake.playbackProgress : 0
  const playing = currentItem.isPlaying || bestItem.isPlaying
  const activeTone: 'current' | 'best' | 'live' = bestItem.isPlaying
    ? 'best'
    : showLiveRibbon
      ? 'live'
      : 'current'

  const washMode: RecordWashMode = isRecording
    ? 'recording'
    : bestItem.isPlaying
      ? 'playing-best'
      : currentItem.isPlaying
        ? 'playing-current'
        : listening
          ? 'hearing'
          : 'idle'

  useRecordWash(stageRef, washMode, liveEnergy, true)

  const status = isRecording
    ? 'Recording'
    : !ready
      ? 'Preparing'
      : playing
        ? 'Playing'
        : listening
          ? 'Listening'
          : 'Ready'
  const timerSeconds = isRecording
    ? elapsed
    : playing
      ? activeTake.currentTime
      : 0

  const handleWaveformScrub = useCallback(
    (progress: number, phase: ScrubPhase) => {
      const target = bestItem.isPlaying ? bestItem : currentItem.hasMedia ? currentItem : bestItem
      if (!target.hasMedia || !target.playbackItem) return
      const duration = target.durationSeconds
      if (duration <= 0) {
        if (phase === 'start') target.audioPlayback.play(target.playbackItem)
        return
      }
      const nextTime = progress * duration
      if (target.isCurrentItem || target.audioPlayback.matchesCurrentSource(target.playbackItem)) {
        target.audioPlayback.seek(nextTime)
      } else if (phase === 'start') {
        target.audioPlayback.play(target.playbackItem, { startTime: nextTime })
      }
    },
    [bestItem, currentItem],
  )

  const canScrub = !isRecording && (currentItem.hasMedia || bestItem.hasMedia)
  const showCurrentKey =
    showTakeKeys && !isRecording && (currentItem.hasMedia || (holdWritten && writtenPeaks.length > 0))
  const showBestKey = showTakeKeys && !isRecording && bestItem.hasMedia

  return (
    <section
      ref={stageRef}
      className={`audio-mode-home audio-record-stage audio-record-stage--${washMode} pointer-events-auto`}
    >
      <motion.div
        className="audio-record-readout"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={iosHudDim}
        style={motionGpuLayer}
      >
        <p className="audio-record-readout__status" role="status" aria-live="polite">
          <span aria-hidden />
          {status}
        </p>
        <p className="audio-record-readout__time">
          <time>{formatDuration(timerSeconds)}</time>
        </p>
      </motion.div>

      <RecordStageRibbon
        currentPeaks={currentPeaks}
        bestPeaks={isRecording || holdWritten || currentItem.hasMedia || bestItem.hasMedia ? bestPeaks : []}
        widthRatio={widthRatio}
        playhead={playhead}
        recording={isRecording}
        playing={playing}
        activeTone={activeTone}
        onScrub={handleWaveformScrub}
        disabled={!canScrub}
        hapticFeedback={hapticFeedback}
      />

      {showCurrentKey || showBestKey ? (
        <div className="audio-record-keys" aria-label="Takes">
          {showBestKey ? (
            <RecordTraceKey
              tone="best"
              label="Best"
              playing={bestItem.isPlaying}
              onPlay={bestItem.togglePlayback}
              onClear={onClearBenchmark}
            />
          ) : null}
          {showCurrentKey ? (
            <RecordTraceKey
              tone="current"
              label="Current"
              playing={currentItem.isPlaying}
              onPlay={currentItem.togglePlayback}
              onPin={currentItem.hasMedia ? onPinCurrentAsBest : undefined}
              onClear={onClearChallenger}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default memo(AudioModeHome)
