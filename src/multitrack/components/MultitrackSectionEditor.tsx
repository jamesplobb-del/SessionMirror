import { Scissors, RotateCcw } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'
import IOSSwitch from '../../components/ui/IOSSwitch'
import { hasSectionWindow } from '../layout/sectionVisibility'
import type { PerformancePanelState } from '../types'

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Scopes a box to one song section. While the window is off the box spans the
 * whole song (the default); switching it on parks the start at the current
 * playhead so "jump to the chorus, add a harmony box" is two taps.
 */
export default function MultitrackSectionEditor({
  panel,
  durationSec,
  currentTimeSec,
  onChange,
}: {
  panel: PerformancePanelState
  durationSec: number
  currentTimeSec: number
  onChange: (startSec: number | undefined, endSec: number | undefined) => void
}) {
  const enabled = hasSectionWindow(panel)
  // A zero-length song (nothing recorded yet) still needs a usable slider range.
  const max = Math.max(1, Math.round(durationSec) || 60)
  const start = panel.sectionStartSec ?? 0
  const end = panel.sectionEndSec ?? max

  const toggle = (next: boolean) => {
    if (!next) {
      onChange(undefined, undefined)
      return
    }
    const seededStart = Math.min(Math.round(currentTimeSec), Math.max(0, max - 1))
    onChange(seededStart, max)
  }

  return (
    <div className="multitrack-section-editor">
      <label className="multitrack-section-editor__toggle">
        <span>
          <strong>Only show for part of the song</strong>
          <small>
            {enabled
              ? `Appears ${formatTime(start)} – ${formatTime(end)}`
              : 'Box is on screen the whole time'}
          </small>
        </span>
        <IOSSwitch checked={enabled} onChange={toggle} />
      </label>

      {enabled ? (
        <>
          <label className="multitrack-section-editor__row">
            <span>Starts</span>
            <output>{formatTime(start)}</output>
            <input
              type="range"
              min={0}
              max={max}
              step={1}
              value={Math.min(start, max)}
              aria-label="Section start"
              onChange={(event) => {
                const nextStart = Number(event.target.value)
                onChange(nextStart, Math.max(nextStart + 1, end))
              }}
            />
          </label>
          <label className="multitrack-section-editor__row">
            <span>Ends</span>
            <output>{formatTime(end)}</output>
            <input
              type="range"
              min={0}
              max={max}
              step={1}
              value={Math.min(end, max)}
              aria-label="Section end"
              onChange={(event) => {
                const nextEnd = Number(event.target.value)
                onChange(Math.min(start, Math.max(0, nextEnd - 1)), nextEnd)
              }}
            />
          </label>
          <div className="multitrack-section-editor__actions">
            <Pressable
              type="button"
              intensity="soft"
              onClick={() => onChange(Math.round(currentTimeSec), Math.max(Math.round(currentTimeSec) + 1, end))}
            >
              <Scissors className="h-4 w-4" />
              Start here
            </Pressable>
            <Pressable type="button" intensity="soft" onClick={() => onChange(undefined, undefined)}>
              <RotateCcw className="h-4 w-4" />
              Whole song
            </Pressable>
          </div>
        </>
      ) : null}
    </div>
  )
}
