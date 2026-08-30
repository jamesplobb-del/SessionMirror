import { useMemo } from 'react'
import type { PitchSample, Take } from '../types'

interface PitchComparisonGraphProps {
  benchmarkTake: Take | null
  challengerTake: Take | null
  currentTime: number
  blind: boolean
  benchmarkLabel: string
  challengerLabel: string
}

interface GraphPoint {
  time: number
  midi: number
}

function toGraphPoints(take: Take | null): GraphPoint[] {
  const offsetSeconds = Math.max(0, (take?.timelineOffsetMs ?? 0) / 1_000)
  return (take?.pitchSeries ?? [])
    .map((sample: PitchSample) => ({
      time: sample.time - offsetSeconds,
      midi: 69 + 12 * Math.log2(sample.frequencyHz / 440),
    }))
    .filter((point) => point.time >= 0 && Number.isFinite(point.midi))
}

function pathFor(
  points: GraphPoint[],
  width: number,
  height: number,
  duration: number,
  lowMidi: number,
  highMidi: number,
): string {
  const midiSpan = Math.max(1, highMidi - lowMidi)
  return points
    .map((point, index) => {
      const x = (point.time / duration) * width
      const y = height - ((point.midi - lowMidi) / midiSpan) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

export default function PitchComparisonGraph({
  benchmarkTake,
  challengerTake,
  currentTime,
  blind,
  benchmarkLabel,
  challengerLabel,
}: PitchComparisonGraphProps) {
  const graph = useMemo(() => {
    const benchmark = toGraphPoints(benchmarkTake)
    const challenger = toGraphPoints(challengerTake)
    const all = [...benchmark, ...challenger]
    if (all.length === 0) return null
    const duration = Math.max(1, ...all.map((point) => point.time))
    const midiValues = all.map((point) => point.midi).sort((a, b) => a - b)
    const low = midiValues[Math.floor(midiValues.length * 0.04)] ?? 48
    const high = midiValues[Math.floor(midiValues.length * 0.96)] ?? 72
    const lowMidi = Math.floor(low - 1)
    const highMidi = Math.ceil(Math.max(high + 1, lowMidi + 6))
    return {
      benchmark,
      challenger,
      duration,
      lowMidi,
      highMidi,
      benchmarkPath: pathFor(benchmark, 320, 92, duration, lowMidi, highMidi),
      challengerPath: pathFor(challenger, 320, 92, duration, lowMidi, highMidi),
    }
  }, [benchmarkTake, challengerTake])

  if (!graph) {
    return (
      <div className="pitch-compare-empty">
        Pitch contours appear here after BestTake analyzes a new focused-practice take.
      </div>
    )
  }

  const playheadX = Math.max(0, Math.min(320, (currentTime / graph.duration) * 320))

  return (
    <section className={`pitch-compare-panel ${blind ? 'pitch-compare-panel--blind' : ''}`}>
      <header>
        <strong>Pitch contour</strong>
        <span>Timing is aligned across both takes</span>
      </header>
      <svg viewBox="0 0 320 92" preserveAspectRatio="none" aria-label="Pitch comparison graph">
        <line x1={playheadX} x2={playheadX} y1="0" y2="92" className="pitch-compare-playhead" />
        {graph.benchmarkPath && <path d={graph.benchmarkPath} className="pitch-compare-line pitch-compare-line--benchmark" />}
        {graph.challengerPath && <path d={graph.challengerPath} className="pitch-compare-line pitch-compare-line--challenger" />}
      </svg>
      <div className="pitch-compare-legend">
        <span><i className="pitch-compare-key pitch-compare-key--benchmark" />{benchmarkLabel}</span>
        <span><i className="pitch-compare-key pitch-compare-key--challenger" />{challengerLabel}</span>
      </div>
    </section>
  )
}
