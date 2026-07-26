import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import { COUNT_IN_WHEN_OPTIONS } from '../timelineEditorOptions'
import type { PracticeTrackSettings } from '../types'
import TimelineEditorSelect from './TimelineEditorSelect'

interface TrackSettingsPanelProps {
  settings: PracticeTrackSettings
  onChange: (patch: Partial<PracticeTrackSettings>) => void
}

function playbackOptionsSummary(settings: PracticeTrackSettings): string {
  const countIn =
    settings.countInBars <= 0
      ? 'Count-in off'
      : `${settings.countInBars} bar${settings.countInBars === 1 ? '' : 's'} count-in`
  const loop = settings.loopTrack ? 'Loop on' : 'Loop off'
  return `${countIn} · ${loop}`
}

export default function TrackSettingsPanel({ settings, onChange }: TrackSettingsPanelProps) {
  const [open, setOpen] = useState(false)
  const summary = useMemo(() => playbackOptionsSummary(settings), [settings])

  return (
    <div className="practice-timeline__playback-options pointer-events-auto">
      <Pressable
        type="button"
        intensity="soft"
        className="practice-timeline__playback-options-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="practice-timeline__playback-options-copy">
          <span className="practice-timeline__playback-options-title">Count-in &amp; looping</span>
          {!open ? (
            <span className="practice-timeline__playback-options-summary">{summary}</span>
          ) : null}
        </span>
        {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </Pressable>

      {open ? (
        <div className="practice-timeline__track-settings">
          <p className="practice-timeline__track-settings-intro">
            Choose how the full routine starts and repeats.
          </p>
          <div className="practice-timeline__track-settings-row">
            <span className="practice-timeline__track-settings-label">Count-in</span>
            <div className="practice-timeline-editor__stepper practice-timeline__track-settings-stepper">
              <Pressable
                type="button"
                intensity="icon"
                className="practice-timeline-editor__stepper-btn"
                aria-label="Decrease routine count-in"
                onClick={() =>
                  onChange({
                    countInBars: Math.max(0, settings.countInBars - 1),
                  })
                }
              >
                −
              </Pressable>
              <span className="practice-timeline-editor__stepper-value">
                {settings.countInBars <= 0
                  ? 'Off'
                  : `${settings.countInBars} bar${settings.countInBars === 1 ? '' : 's'}`}
              </span>
              <Pressable
                type="button"
                intensity="icon"
                className="practice-timeline-editor__stepper-btn"
                aria-label="Increase routine count-in"
                onClick={() =>
                  onChange({
                    countInBars: Math.min(8, settings.countInBars + 1),
                  })
                }
              >
                +
              </Pressable>
            </div>
          </div>

          {settings.countInBars > 0 ? (
            <div className="practice-timeline__track-settings-select">
              <TimelineEditorSelect
                label="Count-in when"
                ariaLabel="When to play count-in"
                value={settings.countInWhen}
                options={COUNT_IN_WHEN_OPTIONS}
                onChange={(countInWhen) => onChange({ countInWhen })}
              />
            </div>
          ) : null}

          <div className="practice-timeline__track-settings-loop">
            <span className="practice-timeline__track-settings-loop-copy">
              <strong>Loop routine</strong>
              <small>Start again after the last section</small>
            </span>
            <IOSSwitch
              checked={settings.loopTrack}
              ariaLabel="Loop routine"
              onChange={(loopTrack) => onChange({ loopTrack })}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
