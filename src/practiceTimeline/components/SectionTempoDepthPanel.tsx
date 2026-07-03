import { Plus, Trash2 } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import { effectiveBars, resolveSectionTiming } from '../timeSignatureLogic'
import { createTempoMarkerId } from '../tempoDepth'
import {
  TEMPO_RAMP_OPTIONS,
  TEMPO_RAMP_SHAPE_OPTIONS,
  tempoRampModeFromSection,
  type TempoRampMode,
} from '../timelineEditorOptions'
import type { SectionTempoMarker, TempoRampShape, TimelineSection } from '../types'
import TimelineEditorSelect from './TimelineEditorSelect'

interface SectionTempoDepthPanelProps {
  section: TimelineSection
  onChange: (patch: Partial<TimelineSection>) => void
}

function markerPositionLabel(marker: SectionTempoMarker): string {
  if (marker.beat && marker.beat > 1) {
    return `Bar ${marker.measure}, beat ${marker.beat}`
  }
  return `Bar ${marker.measure}`
}

export default function SectionTempoDepthPanel({
  section,
  onChange,
}: SectionTempoDepthPanelProps) {
  const timing = resolveSectionTiming(section)
  const totalMeasures = effectiveBars(section)
  const markers = section.advanced?.tempoMarkers ?? []
  const ramp = section.advanced?.tempoRamp
  const rampShape: TempoRampShape = ramp?.shape ?? 'linear'

  const updateAdvanced = (patch: Partial<NonNullable<TimelineSection['advanced']>>) => {
    onChange({ advanced: { ...section.advanced, ...patch } })
  }

  const updateMarkers = (next: SectionTempoMarker[]) => {
    updateAdvanced({ tempoMarkers: next.length ? next : undefined })
  }

  const handleTempoRampChange = (mode: TempoRampMode) => {
    if (mode === 'off') {
      updateAdvanced({
        tempoRamp: { enabled: false, endBpm: section.bpm, shape: rampShape },
      })
      return
    }

    const endBpm =
      mode === 'faster'
        ? Math.min(300, section.bpm + 20)
        : Math.max(40, section.bpm - 20)

    updateAdvanced({
      tempoRamp: { enabled: true, endBpm, shape: rampShape },
    })
  }

  const updateMarker = (id: string, patch: Partial<SectionTempoMarker>) => {
    updateMarkers(
      markers.map((marker) => (marker.id === id ? { ...marker, ...patch } : marker)),
    )
  }

  const removeMarker = (id: string) => {
    updateMarkers(markers.filter((marker) => marker.id !== id))
  }

  const addMarker = () => {
    const usedMeasures = new Set(markers.map((m) => m.measure))
    let measure = 1
    while (usedMeasures.has(measure) && measure < totalMeasures) {
      measure += 1
    }
    const next: SectionTempoMarker = {
      id: createTempoMarkerId(),
      measure: Math.min(totalMeasures, measure),
      bpm: section.bpm,
    }
    updateMarkers([...markers, next].sort((a, b) => a.measure - b.measure || (a.beat ?? 1) - (b.beat ?? 1)))
  }

  return (
    <div className="practice-timeline-editor__tempo-depth">
      <p className="practice-timeline-editor__label">Tempo changes</p>

      <div className="practice-timeline-editor__select-grid">
        <TimelineEditorSelect
          label="Gradual change"
          ariaLabel="Gradual tempo change"
          value={tempoRampModeFromSection(section)}
          options={TEMPO_RAMP_OPTIONS}
          onChange={handleTempoRampChange}
        />

        {ramp?.enabled ? (
          <TimelineEditorSelect
            label="Ramp shape"
            ariaLabel="Tempo ramp curve shape"
            value={rampShape}
            options={TEMPO_RAMP_SHAPE_OPTIONS}
            onChange={(shape) =>
              updateAdvanced({
                tempoRamp: {
                  enabled: true,
                  endBpm: ramp.endBpm,
                  shape,
                },
              })
            }
          />
        ) : null}
      </div>

      {ramp?.enabled ? (
        <div className="practice-timeline-editor__stepper">
          <span className="practice-timeline-editor__label">End tempo ({timing.bpmSymbol})</span>
          <div className="practice-timeline-editor__stepper">
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() =>
                updateAdvanced({
                  tempoRamp: {
                    enabled: true,
                    endBpm: Math.max(40, ramp.endBpm - 1),
                    shape: rampShape,
                  },
                })
              }
            >
              −
            </Pressable>
            <span className="practice-timeline-editor__stepper-value">{ramp.endBpm}</span>
            <Pressable
              type="button"
              intensity="icon"
              className="practice-timeline-editor__stepper-btn"
              onClick={() =>
                updateAdvanced({
                  tempoRamp: {
                    enabled: true,
                    endBpm: Math.min(300, ramp.endBpm + 1),
                    shape: rampShape,
                  },
                })
              }
            >
              +
            </Pressable>
          </div>
        </div>
      ) : null}

      <div className="practice-timeline-editor__tempo-markers">
        <div className="practice-timeline-editor__tempo-markers-header">
          <span className="practice-timeline-editor__label">Pins</span>
          <Pressable type="button" intensity="soft" onClick={addMarker}>
            <Plus size={14} className="mr-1 inline" />
            Add
          </Pressable>
        </div>

        {markers.length === 0 ? (
          <p className="practice-timeline-editor__hint">No pins</p>
        ) : (
          <ul className="practice-timeline-editor__tempo-marker-list">
            {markers.map((marker) => (
              <li key={marker.id} className="practice-timeline-editor__tempo-marker-row">
                <span className="practice-timeline-editor__tempo-marker-pos">
                  {markerPositionLabel(marker)}
                </span>
                <div className="practice-timeline-editor__stepper practice-timeline-editor__stepper--compact">
                  <Pressable
                    type="button"
                    intensity="icon"
                    className="practice-timeline-editor__stepper-btn"
                    aria-label="Earlier bar"
                    onClick={() =>
                      updateMarker(marker.id, {
                        measure: Math.max(1, marker.measure - 1),
                      })
                    }
                  >
                    −
                  </Pressable>
                  <span className="practice-timeline-editor__stepper-value">{marker.measure}</span>
                  <Pressable
                    type="button"
                    intensity="icon"
                    className="practice-timeline-editor__stepper-btn"
                    aria-label="Later bar"
                    onClick={() =>
                      updateMarker(marker.id, {
                        measure: Math.min(totalMeasures, marker.measure + 1),
                      })
                    }
                  >
                    +
                  </Pressable>
                </div>
                <div className="practice-timeline-editor__stepper practice-timeline-editor__stepper--compact">
                  <Pressable
                    type="button"
                    intensity="icon"
                    className="practice-timeline-editor__stepper-btn"
                    aria-label="Earlier beat"
                    onClick={() => {
                      const beat = marker.beat ?? 1
                      if (beat <= 1) {
                        updateMarker(marker.id, { beat: undefined })
                      } else {
                        updateMarker(marker.id, { beat: beat - 1 })
                      }
                    }}
                  >
                    −
                  </Pressable>
                  <span className="practice-timeline-editor__stepper-value" title="Beat within bar (1 = bar line)">
                    {marker.beat && marker.beat > 1 ? marker.beat : '—'}
                  </span>
                  <Pressable
                    type="button"
                    intensity="icon"
                    className="practice-timeline-editor__stepper-btn"
                    aria-label="Later beat"
                    onClick={() =>
                      updateMarker(marker.id, {
                        beat: Math.min(timing.pulseCount, (marker.beat ?? 1) + 1),
                      })
                    }
                  >
                    +
                  </Pressable>
                </div>
                <div className="practice-timeline-editor__stepper practice-timeline-editor__stepper--compact">
                  <Pressable
                    type="button"
                    intensity="icon"
                    className="practice-timeline-editor__stepper-btn"
                    onClick={() =>
                      updateMarker(marker.id, { bpm: Math.max(40, marker.bpm - 1) })
                    }
                  >
                    −
                  </Pressable>
                  <span className="practice-timeline-editor__stepper-value">{marker.bpm}</span>
                  <Pressable
                    type="button"
                    intensity="icon"
                    className="practice-timeline-editor__stepper-btn"
                    onClick={() =>
                      updateMarker(marker.id, { bpm: Math.min(300, marker.bpm + 1) })
                    }
                  >
                    +
                  </Pressable>
                </div>
                <Pressable
                  type="button"
                  intensity="icon"
                  aria-label="Remove tempo pin"
                  onClick={() => removeMarker(marker.id)}
                >
                  <Trash2 size={16} />
                </Pressable>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
