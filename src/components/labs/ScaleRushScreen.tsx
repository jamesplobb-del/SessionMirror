import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronLeft } from 'lucide-react'
import '../../styles/scale-rush.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import {
  computeAccuracy,
  RANGE_LABELS,
  SCALE_LABELS,
  SCALE_RUSH_KEYS,
  SCALE_RUSH_RANGES,
  SCALE_RUSH_SCALES,
  type ScaleRushKey,
  type ScaleRushRange,
  type ScaleRushScale,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import { useScaleRushGame } from '../../labs/scaleRush/useScaleRushGame'
import { getTunerProfile, type TunerInstrument } from '../../utils/pitchConfig'
import Pressable from '../ui/Pressable'
import ScaleRushGame from './ScaleRushGame'

interface ScaleRushScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  onRequestMicStream: () => void
  onBack: () => void
}

export default function ScaleRushScreen({
  streamRef,
  streamGeneration,
  tunerInstrument,
  onRequestMicStream,
  onBack,
}: ScaleRushScreenProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [draftKey, setDraftKey] = useState<ScaleRushKey>('C')
  const [draftScale] = useState<ScaleRushScale>('major')
  const [draftRange] = useState<ScaleRushRange>('1-octave')

  useEffect(() => {
    onRequestMicStream()
  }, [onRequestMicStream, streamGeneration])

  // Pitch integration: read-only mic tracker — shared by gameplay + live tuner HUD.
  const pitchEnabled = true
  const { readout } = useLivePitchTracker(
    mediaRef,
    pitchEnabled,
    pitchEnabled,
    `scale-rush-${streamGeneration}`,
    canvasRef,
    'solid',
    {
      source: 'microphone',
      micStreamRef: streamRef,
      tunerInstrument,
      realtimeMode: true,
      continuousScroll: false,
      allowStandaloneMicFallback: true,
    },
  )

  const { state, start, restart, backToSetup } = useScaleRushGame(readout, pitchEnabled)
  const instrumentProfile = getTunerProfile(tunerInstrument)

  if (state.phase === 'setup') {
    return (
      <div className="scale-rush-screen scale-rush-screen--setup">
        <header className="scale-rush-header mb-5 flex items-center gap-3">
          <Pressable type="button" intensity="soft" onClick={onBack} aria-label="Back to Labs">
            <ChevronLeft className="h-6 w-6 text-stone-600" />
          </Pressable>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Scale Rush</h1>
            <p className="text-xs text-stone-400">v0.05 · Crossy Road style</p>
          </div>
        </header>

        <p className="mb-6 text-sm text-stone-500">
          Cross the course one tile at a time by playing each note on the path ahead. Wrong notes and
          timeouts cost a heart.
        </p>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Key</p>
            <div className="flex flex-wrap gap-2">
              {SCALE_RUSH_KEYS.map((key) => (
                <Pressable
                  key={key}
                  type="button"
                  intensity="soft"
                  onClick={() => setDraftKey(key)}
                  className={`min-w-[2.75rem] rounded-xl border px-3 py-2 text-sm font-semibold ${
                    draftKey === key
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >
                  {key}
                </Pressable>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Scale</p>
            <div className="flex flex-wrap gap-2">
              {SCALE_RUSH_SCALES.map((scale) => (
                <span
                  key={scale}
                  className="rounded-xl border border-sky-600 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800"
                >
                  {SCALE_LABELS[scale]}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Range</p>
            <div className="flex flex-wrap gap-2">
              {SCALE_RUSH_RANGES.map((range) => (
                <span
                  key={range}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700"
                >
                  {RANGE_LABELS[range]}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Instrument
            </p>
            <p className="text-sm font-medium text-stone-800">{instrumentProfile.label}</p>
            <p className="mt-0.5 text-xs text-stone-500">Concert pitch · Settings → Pitch &amp; Tuning</p>
          </div>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          {state.bestScore > 0 && (
            <p className="text-center text-xs text-stone-500">Best score: {state.bestScore}</p>
          )}
          <Pressable
            type="button"
            intensity="soft"
            onClick={() =>
              start({
                key: draftKey,
                scale: draftScale,
                range: draftRange,
                tunerInstrument,
              })
            }
            className="w-full rounded-2xl bg-stone-900 py-4 text-lg font-semibold text-white"
          >
            Start
          </Pressable>
        </div>
      </div>
    )
  }

  if (state.phase === 'gameover' && state.config) {
    const accuracy = computeAccuracy(state.correctCount, state.missCount)
    return (
      <div className="scale-rush-screen scale-rush-screen--gameover">
        <h1 className="mb-6 text-2xl font-bold text-stone-900">Game Over</h1>
        <dl className="space-y-3 text-sm text-stone-700">
          <div className="flex justify-between">
            <dt>Final score</dt>
            <dd className="font-semibold tabular-nums">{state.score}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Best score</dt>
            <dd className="font-semibold tabular-nums">{state.bestScore}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Longest streak</dt>
            <dd className="font-semibold tabular-nums">{state.bestStreak}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Accuracy</dt>
            <dd className="font-semibold tabular-nums">{accuracy}%</dd>
          </div>
        </dl>
        <div className="mt-auto space-y-3 pt-10">
          <Pressable
            type="button"
            intensity="soft"
            onClick={restart}
            className="w-full rounded-2xl bg-stone-900 py-4 text-base font-semibold text-white"
          >
            Restart
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            onClick={backToSetup}
            className="w-full rounded-2xl border border-stone-200 py-3 text-sm font-semibold text-stone-700"
          >
            Home
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            onClick={onBack}
            className="w-full py-2 text-sm font-medium text-stone-500"
          >
            Back to Labs
          </Pressable>
        </div>
      </div>
    )
  }

  return (
    <ScaleRushGame
      state={state}
      readout={readout}
      canvasRef={canvasRef}
      onPause={backToSetup}
    />
  )
}
