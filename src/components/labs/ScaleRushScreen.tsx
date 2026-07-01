import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronLeft } from 'lucide-react'
import '../../styles/scale-rush.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import {
  computeAccuracy,
  keysForScaleMode,
  RANGE_LABELS,
  SCALE_MODE_LABELS,
  SCALE_RUSH_RANGES,
  SCALE_RUSH_TRANSPOSITIONS,
  scaleDisplayName,
  type ScaleRushKey,
  type ScaleRushRange,
  type ScaleRushScaleMode,
  type ScaleRushTransposition,
} from '../../labs/scaleRush/scaleRushMusicLogic'
import { useScaleRushGame } from '../../labs/scaleRush/useScaleRushGame'
import { getTunerProfile, type TunerInstrument } from '../../utils/pitchConfig'
import IOSSwitch from '../ui/IOSSwitch'
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
  const [draftScaleMode, setDraftScaleMode] = useState<ScaleRushScaleMode>('major')
  const [draftKey, setDraftKey] = useState<ScaleRushKey>('C')
  const [draftRange, setDraftRange] = useState<ScaleRushRange>('1-octave')
  const [draftEndless, setDraftEndless] = useState(false)
  const [draftTransposition, setDraftTransposition] = useState<ScaleRushTransposition>('concert')
  const [pitchAccuracyStrict, setPitchAccuracyStrict] = useState(false)

  const availableKeys = keysForScaleMode(draftScaleMode)

  useEffect(() => {
    if (!availableKeys.includes(draftKey)) {
      setDraftKey(availableKeys[0]!)
    }
  }, [availableKeys, draftKey])

  useEffect(() => {
    onRequestMicStream()
  }, [onRequestMicStream, streamGeneration])

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
            <p className="text-xs text-stone-400">v0.1 · Crossy Road for musicians</p>
          </div>
        </header>

        <p className="mb-1 text-sm font-medium text-stone-700">Play your scale to cross the course.</p>
        <p className="mb-6 text-sm text-stone-500">
          Hop one tile per correct note. Wrong notes and timeouts cost a heart. Any octave of the
          target note counts in v0.1.
        </p>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Instrument
            </p>
            <label htmlFor="scale-rush-transposition" className="sr-only">
              Transposing instrument
            </label>
            <select
              id="scale-rush-transposition"
              value={draftTransposition}
              onChange={(event) =>
                setDraftTransposition(event.target.value as ScaleRushTransposition)
              }
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-800"
            >
              {SCALE_RUSH_TRANSPOSITIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500">
              Mic profile: {instrumentProfile.label} · change in Settings → Pitch &amp; Tuning
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              Scale
            </p>
            <div className="flex flex-wrap gap-2">
              {(['major', 'minor'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  type="button"
                  intensity="soft"
                  onClick={() => setDraftScaleMode(mode)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    draftScaleMode === mode
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >
                  {SCALE_MODE_LABELS[mode]}
                </Pressable>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Key</p>
            <div className="flex flex-wrap gap-2">
              {availableKeys.map((key) => (
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
                  {scaleDisplayName(key, draftScaleMode)}
                </Pressable>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Range</p>
            <div className="flex flex-wrap gap-2">
              {SCALE_RUSH_RANGES.map((range) => (
                <Pressable
                  key={range}
                  type="button"
                  intensity="soft"
                  onClick={() => setDraftRange(range)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    draftRange === range
                      ? 'border-sky-600 bg-sky-600 text-white'
                      : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >
                  {RANGE_LABELS[range]}
                </Pressable>
              ))}
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-stone-900">Endless mode</p>
              <p className="mt-0.5 text-xs text-stone-500">
                Ascend the scale continuously without turning back
              </p>
            </div>
            <IOSSwitch
              checked={draftEndless}
              onChange={setDraftEndless}
              ariaLabel="Enable endless mode"
            />
          </label>

          <label className="flex items-center justify-between gap-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-stone-900">Pitch accuracy</p>
              <p className="mt-0.5 text-xs text-stone-500">
                {pitchAccuracyStrict
                  ? 'Must be within ±15¢ of the target note'
                  : 'Note name match only (recommended for v0.1)'}
              </p>
            </div>
            <IOSSwitch
              checked={pitchAccuracyStrict}
              onChange={setPitchAccuracyStrict}
              ariaLabel="Require pitch accuracy within 15 cents"
            />
          </label>
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
                scaleMode: draftScaleMode,
                range: draftRange,
                endless: draftEndless,
                tunerInstrument,
                transposition: draftTransposition,
                pitchAccuracyStrict,
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
    const scaleName = scaleDisplayName(state.config.key, state.config.scaleMode)
    return (
      <div className="scale-rush-screen scale-rush-screen--gameover">
        <h1 className="mb-2 text-2xl font-bold text-stone-900">Game Over</h1>
        <p className="mb-6 text-sm text-stone-500">{scaleName} · {RANGE_LABELS[state.config.range]}</p>
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
