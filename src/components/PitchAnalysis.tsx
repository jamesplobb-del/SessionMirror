import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import TakeVideoPlayer from './TakeVideoPlayer'
import type { Take } from '../types'
import {
  buildPitchChartData,
  formatPitchReadout,
  frequencyToPitchReadout,
  interpolateFrequencyAtTime,
  isInTune,
  resolvePitchSeries,
  type PitchChartPoint,
} from '../utils/pitchUtils'

interface PitchAnalysisProps {
  isOpen: boolean
  onClose: () => void
  currentTake: Take
  bestTake: Take
}

const BEST_COLOR = '#fbbf24'
const CURRENT_COLOR = '#38bdf8'
const PLAYHEAD_COLOR = 'rgba(255,255,255,0.85)'
const GRID_COLOR = 'rgba(255,255,255,0.08)'

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
    <div className="rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-xs shadow-xl backdrop-blur-md">
      <p className="mb-1.5 font-medium text-white/60">{timeLabel}</p>
      <p className="text-amber-400">
        Best Take: <span className="font-semibold text-white">{bestReadout}</span>
      </p>
      <p className="text-sky-400">
        Current Take:{' '}
        <span className="font-semibold text-white">{currentReadout}</span>
      </p>
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
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!isOpen) return
    setCurrentTime(0)
    setDuration(0)
  }, [isOpen, currentTake.id])

  const bestSeries = useMemo(
    () => resolvePitchSeries(bestTake.id, bestTake.pitchSeries, duration),
    [bestTake.id, bestTake.pitchSeries, duration],
  )

  const currentSeries = useMemo(
    () =>
      resolvePitchSeries(currentTake.id, currentTake.pitchSeries, duration),
    [currentTake.id, currentTake.pitchSeries, duration],
  )

  const usingDemoData =
    duration > 0 &&
    (!bestTake.pitchSeries?.length || !currentTake.pitchSeries?.length)

  const chartData = useMemo(
    () => buildPitchChartData(bestSeries, currentSeries),
    [bestSeries, currentSeries],
  )

  const liveFrequency = useMemo(
    () => interpolateFrequencyAtTime(currentSeries, currentTime),
    [currentSeries, currentTime],
  )

  const liveReadout = useMemo(
    () =>
      liveFrequency != null
        ? frequencyToPitchReadout(liveFrequency)
        : { noteName: '—', cents: 0, frequencyHz: 0, midi: 0 },
    [liveFrequency],
  )

  const liveInTune = isInTune(liveReadout.cents)

  const syncCurrentTime = useCallback(() => {
    const media = videoRef.current
    if (!media) return
    setCurrentTime(media.currentTime)
  }, [])

  const handleLoadedMetadata = useCallback(() => {
    const media = videoRef.current
    if (!media) return
    const nextDuration = Number.isFinite(media.duration) ? media.duration : 0
    setDuration(nextDuration)
    setCurrentTime(media.currentTime)
  }, [])

  const handleClose = useCallback(() => {
    videoRef.current?.pause()
    setCurrentTime(0)
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <div
      className="pitch-analysis fixed inset-0 z-[70] flex flex-col overflow-hidden bg-black/95 backdrop-blur-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Pitch analysis comparison"
    >
      <header
        className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-4 py-3 backdrop-blur-md"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="min-w-0 pr-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
            Pitch Analysis
          </p>
          <p className="truncate text-sm font-medium text-white">
            {currentTake.name}
          </p>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/20 active:scale-[0.98]"
        >
          <X className="h-4 w-4" />
          Close
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-[1] bg-black">
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
          className="flex min-h-0 flex-[1] flex-col border-t border-white/10 bg-black/50"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          <div className="flex shrink-0 flex-col items-center gap-1 border-b border-white/10 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              Current Take · A440
            </p>
            <p
              className={`font-mono text-4xl font-semibold tracking-tight tabular-nums transition-colors duration-150 sm:text-5xl ${
                liveInTune ? 'text-emerald-400' : 'text-white'
              }`}
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
            {usingDemoData && (
              <p className="text-[10px] text-white/35">
                Demo pitch data — real analysis not yet attached to takes
              </p>
            )}
          </div>

          <div className="relative min-h-[180px] flex-1 px-2 pb-2 pt-1">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-white/40">
                Loading pitch data…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={[0, Math.max(duration, 0.01)]}
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    tickFormatter={(value) => `${Number(value).toFixed(1)}s`}
                    stroke="rgba(255,255,255,0.15)"
                  />
                  <YAxis
                    domain={[-50, 50]}
                    ticks={[-50, -25, 0, 25, 50]}
                    tick={{ fill: 'rgba(255,255,255,0.35)', fontSize: 10 }}
                    stroke="rgba(255,255,255,0.15)"
                    width={36}
                    tickFormatter={(value) => `${value}¢`}
                  />
                  <Tooltip
                    content={PitchTooltip}
                    cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }}
                  />
                  <ReferenceLine
                    y={0}
                    stroke="rgba(255,255,255,0.12)"
                    strokeDasharray="4 4"
                  />
                  <ReferenceLine
                    x={currentTime}
                    stroke={PLAYHEAD_COLOR}
                    strokeWidth={2}
                    ifOverflow="extendDomain"
                  />
                  <Line
                    type="monotone"
                    dataKey="bestCents"
                    name="Best Take"
                    stroke={BEST_COLOR}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="currentCents"
                    name="Current Take"
                    stroke={CURRENT_COLOR}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}

            <div className="pointer-events-none absolute bottom-3 right-4 flex gap-4 text-[10px] font-medium uppercase tracking-wider">
              <span className="flex items-center gap-1.5 text-amber-400/90">
                <span className="inline-block h-0.5 w-4 rounded-full bg-amber-400" />
                Best Take
              </span>
              <span className="flex items-center gap-1.5 text-sky-400/90">
                <span className="inline-block h-0.5 w-4 rounded-full bg-sky-400" />
                Current Take
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
