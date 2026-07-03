import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import type { PracticeTrackSettings } from '../types'

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
        <div className="practice-timeline__track-settings-row">
          <span className="practice-timeline__track-settings-label">Count-in when</span>
          <div className="practice-timeline-editor__chips">
            <Pressable
              type="button"
              intensity="soft"
              className={`practice-timeline-editor__chip ${settings.countInWhen === 'start' ? 'practice-timeline-editor__chip--active' : ''}`}
              onClick={() => onChange({ countInWhen: 'start' })}
            >
              Start & jumps
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className={`practice-timeline-editor__chip ${settings.countInWhen === 'every-loop' ? 'practice-timeline-editor__chip--active' : ''}`}
              onClick={() => onChange({ countInWhen: 'every-loop' })}
            >
              Every loop
            </Pressable>
          </div>
        </div>
      ) : null}

      <label className="practice-timeline__track-settings-loop">
        <span>Loop routine</span>
        <IOSSwitch checked={settings.loopTrack} onChange={(loopTrack) => onChange({ loopTrack })} />
      </label>
    </div>
  )
}
