import { useRef, useState, type RefObject } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import { computeAccuracy, formatDuration, scoringToStatistics } from '../../labs/engine/scoring'
import {
  KEY_ROOTS,
  SCALE_TYPE_LABELS,
  midiToTargetDisplay,
  type KeyRoot,
  type ScaleType,
} from '../../labs/musicTheory/scales'
import {
  SCALE_RUSH_MODE_LABELS,
  type ScaleRushMode,
} from '../../labs/scaleRush/types'
import { useScaleRushGame } from '../../labs/scaleRush/useScaleRushGame'
import type { TunerInstrument } from '../../utils/pitchConfig'
import Pressable from '../ui/Pressable'
import IOSSegmentedControl from '../ui/IOSSegmentedControl'

interface ScaleRushGameProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  onBack: () => void
}

export default function ScaleRushGame({
  streamRef,
  streamGeneration,
  tunerInstrument,
  onBack,
}: ScaleRushGameProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [draftKey, setDraftKey] = useState<KeyRoot>('C')
  const [draftScale, setDraftScale] = useState<ScaleType>('major')
  const [draftMode, setDraftMode] = useState<ScaleRushMode>('practice')

  const pitchActive = true
  const { readout } = useLivePitchTracker(
    mediaRef,
    pitchActive,
    pitchActive,
    `scale-rush-${streamGeneration}`,
    undefined,
    'solid',
    {
      source: 'microphone',
      micStreamRef: streamRef,
      tunerInstrument,
      realtimeMode: true,
      continuousScroll: false,
    },
  )

  const { state, startWithConfig, restart, backToSetup } = useScaleRushGame(readout, pitchActive)

  const handleStart = () => {
    startWithConfig({ key: draftKey, scaleType: draftScale, mode: draftMode })
  }

  if (state.phase === 'setup') {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
        <header className="mb-8 flex items-center gap-3">
          <Pressable type="button" intensity="soft" onClick={onBack} aria-label="Back to Labs">
            <ChevronLeft className="h-6 w-6 text-stone-600" />
          </Pressable>
          <h1 className="text-xl font-semibold text-stone-900">Scale Rush</h1>
        </header>

        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Key</p>
            <div className="flex flex-wrap gap-2">
              {KEY_ROOTS.map((key) => (
                <Pressable
                  key={key}
                  type="button"
                  intensity="soft"
                  onClick={() => setDraftKey(key)}
                  className={`min-w-[2.75rem] rounded-xl border px-3 py-2 text-sm font-semibold ${
                    draftKey === key
                      ? 'border-stone-900 bg-stone-900 text-white'
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
            <IOSSegmentedControl
              layoutId="scale-rush-scale-type"
              ariaLabel="Scale type"
              value={draftScale}
              onChange={setDraftScale}
              segments={(['major', 'minor'] as const).map((id) => ({
                id,
                label: SCALE_TYPE_LABELS[id],
              }))}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Mode</p>
            <IOSSegmentedControl
              layoutId="scale-rush-mode"
              ariaLabel="Game mode"
              value={draftMode}
              onChange={setDraftMode}
              segments={(['practice', 'survival'] as const).map((id) => ({
                id,
                label: SCALE_RUSH_MODE_LABELS[id],
              }))}
            />
          </div>
        </div>

        <div className="mt-auto pt-10">
          <Pressable
            type="button"
            intensity="soft"
            onClick={handleStart}
            className="w-full rounded-2xl bg-stone-900 py-4 text-lg font-semibold text-white"
          >
            Start
          </Pressable>
        </div>
      </div>
    )
  }

  const config = state.config!
  const targetLabel =
    state.targetMidi != null ? midiToTargetDisplay(state.targetMidi, config.key) : '—'
  const livesLabel = config.mode === 'survival' ? `Lives ${state.lives}` : null

  if (state.phase === 'gameover') {
    const summary = scoringToStatistics(state.scoring, state.startedAtMs, state.endedAtMs)
    const durationMs =
      summary.startedAtMs != null && summary.endedAtMs != null
        ? summary.endedAtMs - summary.startedAtMs
        : 0

    return (
      <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-stone-900">Game Over</h1>
        </header>

        <dl className="space-y-3 text-sm text-stone-700">
          <div className="flex justify-between">
            <dt>Final Score</dt>
            <dd className="font-semibold tabular-nums">{summary.score}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Highest Combo</dt>
            <dd className="font-semibold tabular-nums">{summary.highestCombo}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Accuracy</dt>
            <dd className="font-semibold tabular-nums">
              {computeAccuracy(summary.correctNotes, summary.incorrectNotes)}%
            </dd>
          </div>
          <div className="flex justify-between">
            <dt>Correct Notes</dt>
            <dd className="font-semibold tabular-nums">{summary.correctNotes}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Incorrect Notes</dt>
            <dd className="font-semibold tabular-nums">{summary.incorrectNotes}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Time Played</dt>
            <dd className="font-semibold tabular-nums">{formatDuration(durationMs)}</dd>
          </div>
        </dl>

        <div className="mt-auto space-y-3 pt-10">
          <Pressable
            type="button"
            intensity="soft"
            onClick={restart}
            className="w-full rounded-2xl bg-stone-900 py-4 text-base font-semibold text-white"
          >
            Play Again
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            onClick={() => {
              backToSetup()
            }}
            className="w-full rounded-2xl border border-stone-200 py-3 text-sm font-semibold text-stone-700"
          >
            Change Settings
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
    <div className="flex min-h-0 flex-1 flex-col px-6 py-6">
      <header className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-500">
        <span>Score {state.scoring.score}</span>
        <span className="text-right">Combo {state.scoring.combo}</span>
        <span>Best {state.scoring.highestCombo}</span>
        {livesLabel ? <span className="text-right">{livesLabel}</span> : <span />}
        <span>
          {config.key} {SCALE_TYPE_LABELS[config.scaleType]}
        </span>
        <span className="text-right">{SCALE_RUSH_MODE_LABELS[config.mode]}</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-400">Play</p>
        <p className="text-[7rem] font-semibold leading-none text-stone-900">{targetLabel}</p>
      </div>

      <Pressable
        type="button"
        intensity="soft"
        onClick={backToSetup}
        className="py-3 text-center text-sm font-medium text-stone-500"
      >
        End Game
      </Pressable>
    </div>
  )
}
