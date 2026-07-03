import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import { COUNT_IN_WHEN_OPTIONS } from '../timelineEditorOptions'
import type { PracticeTrackSettings } from '../types'
import TimelineEditorSelect from './TimelineEditorSelect'

interface TrackSettingsPanelProps {
  settings: PracticeTrackSettings
  onChange: (patch: Partial<PracticeTrackSettings>) => void
}

export default function TrackSettingsPanel({ settings, onChange }: TrackSettingsPanelProps) {
  return (
    <div className="practice-timeline__track-settings pointer-events-auto">
      <div className="practice-timeline__track-settings-row">
        <span className="practice-timeline__track-settings-label">Count-in</span>
        <div className="practice-timeline-editor__stepper practice-timeline__track-settings-stepper">
          <Pressable
            type="button"
            intensity="icon"
            className="practice-timeline-editor__stepper-btn"
            onClick={() => onChange({ countInBars: Math.max(0, settings.countInBars - 1) })}
          >
            −
          </Pressable>
          <span className="practice-timeline-editor__stepper-value">
            {settings.countInBars <= 0 ? 'Off' : `${settings.countInBars} bar${settings.countInBars === 1 ? '' : 's'}`}
          </span>
          <Pressable
            type="button"
            intensity="icon"
            className="practice-timeline-editor__stepper-btn"
            onClick={() => onChange({ countInBars: Math.min(8, settings.countInBars + 1) })}
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

      <label className="practice-timeline__track-settings-loop">
        <span>Loop routine</span>
        <IOSSwitch checked={settings.loopTrack} onChange={(loopTrack) => onChange({ loopTrack })} />
      </label>
    </div>
  )
}
