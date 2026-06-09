import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import TakeVideoPlayer from './TakeVideoPlayer'
import { useTakePitchAnalysis } from '../hooks/useTakePitchAnalysis'
import type { Take } from '../types'
import {
  INTONATION_COLORS,
  buildPitchChartData,
  computePitchTrackerStats,
  formatFrequencyHz,
  formatPitchReadout,
  frequencyToPitchReadout,
  getIntonationColor,
  interpolateFrequencyAtTime,
  smoothFrequency,
  type PitchChartPoint,
  type PitchTrackerStats,
} from '../utils/pitchUtils'

interface PitchAnalysisProps {
  isOpen: boolean
  onClose: () => void
  currentTake: Take
  bestTake: Take
}

const PLAYHEAD_COLOR = 'rgba(255,255,255,0.9)'
const GRID_COLOR = 'rgba(255,255,255,0.07)'
const WAVE_FILL = 'rgba(59,130,246,0.28)'

interface PitchTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: PitchChartPoint }>
  label?: string | number
}

function PitchTooltip({ active, payload, label }: PitchTooltipProps) {
  if (!active || payload == null || label == null) return null

  const point = payload[0]?.payload
  if (!point) return null

  const timeLabel = `${Number(label).toFixed(2)}s`
  const bestReadout =
    point.bestFrequencyHz != null
      ? formatPitchReadout(frequencyToPitchReadout(point.bestFrequencyHz))
      : '—'
  const currentReadout =
    point.currentFrequencyHz != null
      ? formatPitchReadout(frequencyToPitchReadout(point.currentFrequencyHz))
      : '—'

  return (
    <div className="rounded-xl border border-white/15 bg-black/85 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <p className="mb-1.5 font-medium text-white/60">{timeLabel}</p>
      <p className="text-amber-400">
        Best Take: <span className="font-semibold text-white">{bestReadout}</span>
      </p>
      <p className="text-sky-300">
        Current Take:{' '}
        <span className="font-semibold text-white">{currentReadout}</span>
      </p>
    </div>
  )
}

function PitchTrackerBar({ stats }: { stats: PitchTrackerStats }) {
  const total = stats.green + stats.yellow + stats.red
  if (total <= 0) {
    return (
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-full bg-white/10" />
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{ width: `${stats.green}%` }}
        />
        <div
          className="h-full bg-amber-500 transition-all"
          style={{ width: `${stats.yellow}%` }}
        />
        <div
          className="h-full bg-red-500 transition-all"
          style={{ width: `${stats.red}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] tabular-nums text-white/45">
        <span>{Math.round(stats.green)}% in tune</span>
        <span>{Math.round(stats.yellow)}% close</span>
        <span>{Math.round(stats.red)}% out</span>
      </div>
    </div>
  )
}

export default function PitchAnalysis({
  isOpen,
  onClose,
  currentTake,
  bestTake,
}: PitchAnalysisProps) {
  const videoRef = useRef<HTMLMediaElement>(null)
  const smoothedFrequencyRef = useRef<number | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [liveReadout, setLiveReadout] = useState(() =>
    frequencyToPitchReadout(0),
  )

  const bestAnalysis = useTakePitchAnalysis(bestTake, isOpen)
  const currentAnalysis = useTakePitchAnalysis(currentTake, isOpen)

  const isAnalyzing =
    bestAnalysis.status === 'loading' || currentAnalysis.status === 'loading'
  const analysisError = bestAnalysis.error ?? currentAnalysis.error
  const analysisProgress = Math.min(
    bestAnalysis.progress,
    currentAnalysis.progress,
  )

  useEffect(() => {
    if (!isOpen) return
    setCurrentTime(0)
    setDuration(0)
    smoothedFrequencyRef.current = null
    setLiveReadout(frequencyToPitchReadout(0))
  }, [isOpen, currentTake.id, bestTake.id])

  const bestSeries = bestAnalysis.analysis?.pitchSeries ?? []
  const currentSeries = currentAnalysis.analysis?.pitchSeries ?? []
  const currentWaveform = currentAnalysis.analysis?.waveform ?? []
  const chartDuration =
    duration ||
    currentAnalysis.analysis?.durationSec ||
    bestAnalysis.analysis?.durationSec ||
    0

  const chartData = useMemo(
    () =>
      buildPitchChartData(
        bestSeries,
        currentSeries,
        currentWaveform,
        chartDuration,
      ),
    [bestSeries, currentSeries, currentWaveform, chartDuration],
  )

  const trackerStats = useMemo(
    () => computePitchTrackerStats(currentSeries),
    [currentSeries],
  )

  const syncCurrentTime = useCallback(() => {
    const media = videoRef.current
    if (!media) return

    const time = media.currentTime
    setCurrentTime(time)

    const rawFrequency = interpolateFrequencyAtTime(currentSeries, time)
    if (rawFrequency == null) {
      smoothedFrequencyRef.current = null
      setLiveReadout(frequencyToPitchReadout(0))
      return
    }

    const smoothed = smoothFrequency(
      smoothedFrequencyRef.current,
      rawFrequency,
    )
    smoothedFrequencyRef.current = smoothed
    setLiveReadout(frequencyToPitchReadout(smoothed))
  }, [currentSeries])

  const handleLoadedMetadata = useCallback(() => {
    const media = videoRef.current
    if (!media) return
    const nextDuration = Number.isFinite(media.duration) ? media.duration : 0
    setDuration(nextDuration)
    setCurrentTime(media.currentTime)
    syncCurrentTime()
  }, [syncCurrentTime])

  const handleClose = useCallback(() => {
    videoRef.current?.pause()
    setCurrentTime(0)
    onClose()
  }, [onClose])

  const liveColor = getIntonationColor(liveReadout.cents)
  const chartReady =
    !isAnalyzing &&
    !analysisError &&
    bestAnalysis.status === 'ready' &&
    currentAnalysis.status === 'ready'

  if (!isOpen) return null

  return (
    <div
      className="pitch-analysis fixed inset-0 z-[75] flex flex-col overflow-hidden bg-stone-950/98 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Pitch analysis"
    >
      <header
        className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/50 px-4 py-3 backdrop-blur-md"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="min-w-0 pr-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
            Pitch Analysis
          </p>
          <p className="truncate text-sm font-medium text-white">
            {currentTake.name}
            <span className="text-white/40"> vs </span>
            {bestTake.name}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/20 active:scale-[0.98]"
        >
          <X className="h-4 w-4" />
          Back
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-[2] bg-black">
          <TakeVideoPlayer
            key={`pitch-analysis-${currentTake.id}`}
            filePath={currentTake.filePath}
            videoUrl={currentTake.videoUrl}
            mimeType={currentTake.videoMimeType ?? 'video/mp4'}
            videoRef={videoRef}
            className="h-full w-full object-contain"
            mirror={currentTake.mirrorPlayback !== false}
            controls
            mirroredControls
            audible
            manualPlayOnly
            preload="auto"
            eagerLoad
            onTimeUpdate={syncCurrentTime}
            onSeeked={syncCurrentTime}
            onLoadedMetadata={handleLoadedMetadata}
            onDurationChange={handleLoadedMetadata}
          />
        </div>

        <div
          className="flex min-h-0 flex-[3] flex-col border-t border-white/10 bg-stone-950/90"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="shrink-0 space-y-3 border-b border-white/10 px-4 py-3">
            <PitchTrackerBar stats={trackerStats} />

            <div className="flex flex-col items-center gap-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
                Current Take · A440
              </p>
              <p
                className="font-mono text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl"
                style={{ color: liveReadout.noteName === '—' ? '#fff' : liveColor }}
              >
                {liveReadout.noteName === '—' ? (
                  '—'
                ) : (
                  <>
                    {liveReadout.noteName}
                    <span className="ml-3 text-2xl font-medium text-white/70 sm:text-3xl">
                      {liveReadout.cents >= 0 ? '+' : ''}
                      {Math.round(liveReadout.cents)}¢
                    </span>
                  </>
                )}
              </p>
              <p className="font-mono text-xs text-white/40">
                {formatFrequencyHz(liveReadout.frequencyHz)}
              </p>
            </div>
          </div>

          <div className="relative min-h-[200px] flex-1 px-2 pb-2 pt-1">
            {isAnalyzing && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-stone-950/80 px-6 text-center">
                <p className="text-sm text-white/70">Analyzing pitch…</p>
                <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all duration-200"
                    style={{
                      width: `${Math.round(analysisProgress * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {analysisError && !isAnalyzing && (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                <p className="text-sm text-red-300/90">{analysisError}</p>
                <p className="text-xs text-white/40">
                  Could not decode audio from this take.
                </p>
              </div>
            )}

            {chartReady && chartData.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-white/40">
                No pitched notes detected in this take.
              </div>
            )}

            {chartReady && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={[0, Math.max(chartDuration, 0.01)]}
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    tickFormatter={(value: number) =>
                      `${Number(value).toFixed(1)}s`
                    }
                    stroke="rgba(255,255,255,0.15)"
                  />
                  <YAxis
                    domain={[-50, 50]}
                    ticks={[-50, -25, 0, 25, 50]}
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    stroke="rgba(255,255,255,0.15)"
                    width={36}
                    tickFormatter={(value: number) => `${value}¢`}
                  />
                  <Tooltip
                    content={PitchTooltip}
                    cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="rgba(255,255,255,0.18)"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    x={currentTime}
                    stroke={PLAYHEAD_COLOR}
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                  <Area
                    type="monotone"
                    dataKey="waveUpper"
                    stroke="none"
                    fill={WAVE_FILL}
                    isAnimationActive={false}
                    activeDot={false}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="waveLower"
                    stroke="none"
                    fill={WAVE_FILL}
                    isAnimationActive={false}
                    activeDot={false}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bestCents"
                    name="Best Take"
                    stroke={INTONATION_COLORS.best}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentGreen"
                    name="In tune"
                    stroke={INTONATION_COLORS.green}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentYellow"
                    name="Close"
                    stroke={INTONATION_COLORS.yellow}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="currentRed"
                    name="Out of tune"
                    stroke={INTONATION_COLORS.red}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            <div className="pointer-events-none absolute bottom-3 right-3 flex flex-wrap justify-end gap-3 text-[10px] font-medium uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-amber-400/90">
                <span className="inline-block h-0.5 w-4 rounded-full bg-amber-400" />
                Best
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400/90">
                <span className="inline-block h-0.5 w-4 rounded-full bg-emerald-400" />
                In tune
              </span>
              <span className="flex items-center gap-1.5 text-amber-500/90">
                <span className="inline-block h-0.5 w-4 rounded-full bg-amber-500" />
                Close
              </span>
              <span className="flex items-center gap-1.5 text-red-400/90">
                <span className="inline-block h-0.5 w-4 rounded-full bg-red-400" />
                Out
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
