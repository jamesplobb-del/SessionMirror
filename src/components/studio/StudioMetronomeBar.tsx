import { useCallback, useId, useRef, useState, type PointerEvent } from 'react'
import { triggerLightHaptic } from '../../utils/haptics'
import {
  clampBpm,
  COMPOUND_METERS,
  MAX_BPM,
  METRONOME_SUBDIVISIONS,
  MIN_BPM,
  SIMPLE_METERS,
  type MetronomeSubdivision,
} from '../../utils/metronomeConfig'
import type { StudioCountInPrefs } from './useMultiTrackStudio'

const BPM_DRAG_SENSITIVITY = 0.35

function StudioMetronomeButton({
  label,
  active = false,
  onPress,
  children,
  className = '',
}: {
  label: string
  active?: boolean
  onPress: () => void
  children?: React.ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={() => {
        triggerLightHaptic()
        onPress()
      }}
      className={`metronome-widget__btn interactive-native ${active ? 'metronome-widget__btn--active' : ''} ${className}`.trim()}
    >
      {children}
    </button>
  )
}

export default function StudioMetronomeBar({
  prefs,
  onChange,
  disabled = false,
}: {
  prefs: StudioCountInPrefs
  onChange: (next: StudioCountInPrefs) => void
  disabled?: boolean
}) {
  const bpmInputId = useId()
  const [editingBpm, setEditingBpm] = useState(false)
  const [bpmDraft, setBpmDraft] = useState(String(prefs.bpm))
  const bpmDragRef = useRef<{ startY: number; startBpm: number; moved: boolean } | null>(null)

  const setBpm = useCallback(
    (value: number) => {
      onChange({ ...prefs, bpm: clampBpm(value) })
    },
    [onChange, prefs],
  )

  const commitBpmDraft = useCallback(() => {
    const parsed = Number.parseInt(bpmDraft, 10)
    if (Number.isFinite(parsed)) {
      setBpm(parsed)
    } else {
      setBpmDraft(String(prefs.bpm))
    }
    setEditingBpm(false)
  }, [bpmDraft, prefs.bpm, setBpm])

  const onBpmPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (disabled || editingBpm) return
      bpmDragRef.current = { startY: event.clientY, startBpm: prefs.bpm, moved: false }
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* ignore */
      }
    },
    [disabled, editingBpm, prefs.bpm],
  )

  const onBpmPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!bpmDragRef.current || disabled) return
      const deltaY = event.clientY - bpmDragRef.current.startY
      if (Math.abs(deltaY) > 3) {
        bpmDragRef.current.moved = true
      }
      setBpm(bpmDragRef.current.startBpm - deltaY * BPM_DRAG_SENSITIVITY)
    },
    [disabled, setBpm],
  )

  const endBpmDrag = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (!bpmDragRef.current) return
    const wasTap = !bpmDragRef.current.moved
    bpmDragRef.current = null
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      /* ignore */
    }
    if (wasTap && event.button === 0 && !disabled) {
      setBpmDraft(String(prefs.bpm))
      setEditingBpm(true)
    }
  }, [disabled, prefs.bpm])

  return (
    <div
      className={`studio-metronome-bar metronome-widget relative mb-2 shrink-0 rounded-2xl ${disabled ? 'pointer-events-none opacity-60' : ''}`}
      aria-label="Count-in metronome"
    >
      <div className="metronome-widget__row metronome-widget__row--main pointer-events-auto">
        <div className="metronome-widget__bpm-wrap">
          {editingBpm ? (
            <input
              id={bpmInputId}
              type="number"
              inputMode="numeric"
              min={MIN_BPM}
              max={MAX_BPM}
              value={bpmDraft}
              autoFocus
              onChange={(event) => setBpmDraft(event.target.value)}
              onBlur={commitBpmDraft}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitBpmDraft()
                if (event.key === 'Escape') {
                  setBpmDraft(String(prefs.bpm))
                  setEditingBpm(false)
                }
              }}
              className="metronome-widget__bpm-input pointer-events-auto"
              aria-label="Beats per minute"
            />
          ) : (
            <button
              type="button"
              className="metronome-widget__bpm pointer-events-auto"
              aria-label={`${prefs.bpm} beats per minute. Drag vertically to adjust, or tap to edit.`}
              onPointerDown={onBpmPointerDown}
              onPointerMove={onBpmPointerMove}
              onPointerUp={endBpmDrag}
              onPointerCancel={endBpmDrag}
            >
              <span className="metronome-widget__bpm-value">{prefs.bpm}</span>
              <span className="metronome-widget__bpm-label">BPM</span>
            </button>
          )}
        </div>

        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
          <span>Count</span>
          <select
            value={prefs.countInBeats}
            onChange={(e) =>
              onChange({
                ...prefs,
                countInBeats: Number(e.target.value) === 16 ? 16 : 8,
              })
            }
            className="rounded-lg border border-white/12 bg-white/8 px-2 py-1 text-[11px] font-bold text-white"
          >
            <option value={8}>8</option>
            <option value={16}>16</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[10px] font-medium text-white/70">
          <input
            type="checkbox"
            checked={prefs.metronomeDuringRep}
            onChange={(e) => onChange({ ...prefs, metronomeDuringRep: e.target.checked })}
            className="rounded border-white/20"
          />
          <span className="max-w-[5.5rem] leading-tight">Through take</span>
        </label>
      </div>

      <div className="metronome-widget__row metronome-widget__row--meters pointer-events-auto">
        <div className="metronome-widget__meter-group">
          {SIMPLE_METERS.map((value) => (
            <StudioMetronomeButton
              key={value}
              label={`${value} meter`}
              active={prefs.meter === value}
              onPress={() => onChange({ ...prefs, meter: value })}
              className="metronome-widget__meter-btn"
            >
              {value}
            </StudioMetronomeButton>
          ))}
        </div>
        <span className="metronome-widget__meter-divider" aria-hidden />
        <div className="metronome-widget__meter-group">
          {COMPOUND_METERS.map((value) => (
            <StudioMetronomeButton
              key={value}
              label={`${value} meter`}
              active={prefs.meter === value}
              onPress={() => onChange({ ...prefs, meter: value })}
              className="metronome-widget__meter-btn"
            >
              {value}
            </StudioMetronomeButton>
          ))}
        </div>
      </div>

      <div className="metronome-widget__row metronome-widget__row--subdivisions pointer-events-auto">
        {METRONOME_SUBDIVISIONS.map(({ value, label }) => (
          <StudioMetronomeButton
            key={value}
            label={`${label} subdivisions`}
            active={prefs.subdivision === value}
            onPress={() => onChange({ ...prefs, subdivision: value as MetronomeSubdivision })}
            className="metronome-widget__subdivision-btn"
          >
            {label}
          </StudioMetronomeButton>
        ))}
      </div>
    </div>
  )
}
