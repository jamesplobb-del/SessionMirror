import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronLeft } from 'lucide-react'
import '../../styles/scale-rush.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import { computeAccuracy, pitchClassLabel } from '../../labs/scaleRush/scaleRushMusicLogic'
import { SCALE_RUSH_KEYS, type ScaleRushKey } from '../../labs/scaleRush/scaleRushMusicLogic'
import { useScaleRushGame } from '../../labs/scaleRush/useScaleRushGame'
import { getTunerProfile, type TunerInstrument } from '../../utils/pitchConfig'
import Pressable from '../ui/Pressable'
import ScaleRushLiveTuner from './ScaleRushLiveTuner'
import ScaleRushRunner from './ScaleRushRunner'

interface ScaleRushScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  onRequestMicStream: () => void
  onBack: () => void
}

function Hearts({ count, max = 3 }: { count: number; max?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${count} hearts remaining`}>
      {Array.from({ length: max }, (_, index) => (
        <span
          key={index}
          className={`scale-rush-heart ${index < count ? '' : 'scale-rush-heart--empty'}`}
          aria-hidden
        >
          ♥
        </span>
      ))}
    </span>
  )
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

  useEffect(() => {
    onRequestMicStream()
  }, [onRequestMicStream, streamGeneration])

  // Pitch integration: single mic-backed tracker shared by gameplay + live tuner panel.
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
          <h1 className="text-2xl font-bold text-stone-900">Scale Rush</h1>
        </header>

        <p className="mb-6 text-sm text-stone-500">
          Run the course by playing each target note in the scale. Wrong notes and timeouts cost a
          heart.
        </p>

        <div className="space-y-6">
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
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">Scale</p>
            <p className="text-sm font-medium text-stone-800">Major</p>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Instrument profile
            </p>
            <p className="text-sm font-medium text-stone-800">{instrumentProfile.label}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              Concert pitch · change in Settings → Pitch &amp; Tuning
            </p>
          </div>
        </div>

        <div className="mt-auto space-y-3 pt-8">
          {state.bestScore > 0 && (
            <p className="text-center text-xs text-stone-500">Best score: {state.bestScore}</p>
          )}
          <Pressable
            type="button"
            intensity="soft"
            onClick={() => start({ key: draftKey, tunerInstrument })}
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
            <dt>Best streak</dt>
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
            Change key
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

  const config = state.config!
  const targetLabel = pitchClassLabel(state.targetPitchClass, config.key)

  return (
    <div className="scale-rush-screen scale-rush-screen--playing">
      <header className="scale-rush-play-header mb-3 flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Hearts count={state.hearts} />
          <span className="text-stone-500">
            {config.key} Major
          </span>
        </div>
        <div className="text-right text-stone-600">
          <span className="font-semibold tabular-nums">{state.score}</span>
          <span className="mx-1 text-stone-300">·</span>
          <span className="tabular-nums">×{state.streak}</span>
        </div>
      </header>

      <ScaleRushRunner
        keyRoot={config.key}
        sequenceStep={state.sequenceStep}
        targetPitchClass={state.targetPitchClass}
        advanceToken={state.advanceToken}
        missToken={state.missToken}
      />

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-700">
          Play this note
        </p>
        <p className="text-5xl font-bold text-amber-950">{targetLabel}</p>
      </div>

      <div className="mt-3 min-h-0 flex-1">
        <ScaleRushLiveTuner readout={readout} canvasRef={canvasRef} keyRoot={config.key} />
      </div>

      <Pressable
        type="button"
        intensity="soft"
        onClick={backToSetup}
        className="mt-3 py-2 text-center text-xs font-medium text-stone-400"
      >
        Quit run
      </Pressable>
    </div>
  )
}
