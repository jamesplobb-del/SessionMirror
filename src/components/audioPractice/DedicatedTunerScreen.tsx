import { useMemo, useRef, useState, type RefObject } from 'react'
import { useLivePitchTracker } from '../../hooks/useLivePitchTracker'
import { getIntonationColor } from '../../utils/pitchUtils'
import MetronomeHorizontalScroller, { MetronomeScrollChip } from './MetronomeHorizontalScroller'
import DedicatedTunerNeedle from './DedicatedTunerNeedle'
import {
  DEDICATED_TUNER_PRESETS,
  REFERENCE_PITCH_OPTIONS,
  formatHeroCents,
  getDedicatedTunerStatus,
  parseNoteDisplay,
  presetEngineInstrument,
  type DedicatedTunerPresetId,
  type ReferencePitchHz,
} from './dedicatedTunerConfig'

const STATUS_LABELS = {
  listening: 'Listening…',
  flat: 'Flat',
  sharp: 'Sharp',
  'in-tune': 'In Tune',
} as const

export interface DedicatedTunerScreenProps {
  streamRef: RefObject<MediaStream | null>
  streamGeneration: number
  ready: boolean
  isRecording: boolean
}

export default function DedicatedTunerScreen({
  streamRef,
  streamGeneration,
  ready,
  isRecording,
}: DedicatedTunerScreenProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [presetId, setPresetId] = useState<DedicatedTunerPresetId>('chromatic')
  // TODO: Wire reference pitch into frequencyToPitchReadout when engine supports A4 offset safely.
  const [referencePitch, setReferencePitch] = useState<ReferencePitchHz>(440)

  const engineInstrument = useMemo(() => presetEngineInstrument(presetId), [presetId])
  const trackerEnabled = ready || isRecording

  const { readout, inTuneGlow } = useLivePitchTracker(
    mediaRef,
    trackerEnabled,
    trackerEnabled,
    `dedicated-tuner-${streamGeneration}-${presetId}`,
    undefined,
    'solid',
    {
      source: 'microphone',
      micStreamRef: streamRef,
      continuousScroll: true,
      tunerInstrument: engineInstrument,
      realtimeMode: true,
    },
  )

  const active = readout.noteName !== '—'
  const { pitchClass, octave } = parseNoteDisplay(readout.noteName)
  const status = getDedicatedTunerStatus(readout.noteName, readout.cents)
  const accent = active ? getIntonationColor(readout.cents) : 'rgba(148, 163, 184, 0.55)'

  return (
    <div className="dedicated-tuner flex min-h-0 flex-1 flex-col">
      <div className="dedicated-tuner__card flex min-h-0 flex-1 flex-col">
        <div className="dedicated-tuner__status-row">
          <span
            className={[
              'dedicated-tuner__status',
              `dedicated-tuner__status--${status}`,
            ].join(' ')}
          >
            {STATUS_LABELS[status]}
          </span>
        </div>

        <div className="dedicated-tuner__hero">
          <div className="dedicated-tuner__note-block" style={{ color: accent }}>
            <span className="dedicated-tuner__note-letter" aria-live="polite">
              {active ? pitchClass : '—'}
            </span>
            {active && octave ? (
              <span className="dedicated-tuner__note-octave" aria-hidden>
                {octave}
              </span>
            ) : null}
          </div>
          <p className="dedicated-tuner__cents" style={{ color: accent }} aria-live="polite">
            {active ? formatHeroCents(readout.cents) : 'Listening…'}
          </p>
        </div>

        <div className="dedicated-tuner__needle-wrap">
          <DedicatedTunerNeedle
            cents={readout.cents}
            active={active}
            status={status}
            inTuneGlow={inTuneGlow}
          />
        </div>
      </div>

      <div className="dedicated-tuner__controls shrink-0">
        <MetronomeHorizontalScroller
          label="Instrument"
          ariaLabel="Instrument preset"
          selectedKey={presetId}
          visibleColumns={3}
        >
          {DEDICATED_TUNER_PRESETS.map((preset) => (
            <MetronomeScrollChip
              key={preset.id}
              scrollKey={preset.id}
              label={preset.label}
              active={presetId === preset.id}
              onPress={() => setPresetId(preset.id)}
              className="dedicated-tuner__pill"
            >
              {preset.label}
            </MetronomeScrollChip>
          ))}
        </MetronomeHorizontalScroller>

        <div className="dedicated-tuner__ref-row" role="group" aria-label="Reference pitch">
          <span className="dedicated-tuner__ref-label">A=</span>
          <div className="dedicated-tuner__ref-pills">
            {REFERENCE_PITCH_OPTIONS.map((hz) => (
              <button
                key={hz}
                type="button"
                className={[
                  'dedicated-tuner__ref-pill',
                  referencePitch === hz ? 'dedicated-tuner__ref-pill--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={referencePitch === hz}
                onClick={() => setReferencePitch(hz)}
              >
                {hz}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
