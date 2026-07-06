import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronLeft } from 'lucide-react'
import './staff-jumper.css'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import {
  computeAccuracy,
  keysForScaleMode,
  RANGE_LABELS,
  SCALE_MODE_LABELS,
  STAFF_JUMPER_RANGES,
  scaleDisplayName,
  type StaffJumperKey,
  type StaffJumperRange,
  type StaffJumperScaleMode,
} from './staffJumperMusicLogic'
import { useStaffJumperGame } from './useStaffJumperGame'
import { getTunerProfile, type TunerInstrument } from '../../utils/pitchConfig'
import Pressable from '../../components/ui/Pressable'
import StaffJumperGame from './StaffJumperGame'

interface StaffJumperScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  tunerInstrument: TunerInstrument
  onRequestMicStream: () => void
  onBack: () => void
}

export default function StaffJumperScreen({
  streamRef,
  streamGeneration,
  tunerInstrument,
  onRequestMicStream,
  onBack,
}: StaffJumperScreenProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [draftScaleMode, setDraftScaleMode] = useState<StaffJumperScaleMode>('major')
  const [draftKey, setDraftKey] = useState<StaffJumperKey>('C')
  const [draftRange, setDraftRange] = useState<StaffJumperRange>('1-octave')

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
    `staff-jumper-${streamGeneration}`,
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

  const { state, start, restart, backToSetup, completeFall } = useStaffJumperGame(
    readout,
    pitchEnabled,
  )
  const instrumentProfile = getTunerProfile(tunerInstrument)

  if (state.phase === 'setup') {
    return (
      <div className="sj-screen sj-screen--setup">
        <header className="mb-5 flex items-center gap-3">
          <Pressable type="button" intensity="soft" onClick={onBack} aria-label="Back to Labs">
            <ChevronLeft className="h-6 w-6 text-stone-600" />
          </Pressable>
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Staff Jumper</h1>
            <p className="text-xs text-stone-400">v0.1 · Jump the staff with your instrument</p>
          </div>
        </header>

        <p className="mb-1 text-sm font-medium text-stone-700">
          Play each note to jump across the staff.
        </p>
        <p className="mb-6 text-sm text-stone-500">
          Concert pitch · treble clef only. Wrong notes and timeouts crack a platform. Three misses
          and you fall off the staff. Any octave of the target note counts in v0.1.
        </p>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">Scale</p>
            <div className="flex flex-wrap gap-2">
              {(['major', 'minor'] as const).map((mode) => (
                <Pressable
                  key={mode}
                  type="button"
                  intensity="soft"
                  onClick={() => setDraftScaleMode(mode)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    draftScaleMode === mode
                      ? 'border-violet-600 bg-violet-600 text-white'
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
                      ? 'border-violet-600 bg-violet-600 text-white'
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
              {STAFF_JUMPER_RANGES.map((range) => (
                <Pressable
                  key={range}
                  type="button"
                  intensity="soft"
                  onClick={() => setDraftRange(range)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    draftRange === range
                      ? 'border-violet-600 bg-violet-600 text-white'
                      : 'border-stone-200 bg-white text-stone-700'
                  }`}
                >
                  {RANGE_LABELS[range]}
                </Pressable>
              ))}
            </div>
          </div>

          <p className="text-xs text-stone-500">
            Mic profile: {instrumentProfile.label} · change in Settings → Pitch &amp; Tuning
          </p>
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
    const scaleName = scaleDisplayName(state.config.key, state.config.scaleMode)
    return (
      <div className="sj-screen sj-screen--gameover">
        <h1 className="mb-2 text-2xl font-bold text-stone-900">Game Over</h1>
        <p className="mb-6 text-sm text-stone-500">
          {scaleName} · {RANGE_LABELS[state.config.range]}
        </p>
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
    <StaffJumperGame
      state={state}
      readout={readout}
      onPause={backToSetup}
      onFallComplete={completeFall}
    />
  )
}
