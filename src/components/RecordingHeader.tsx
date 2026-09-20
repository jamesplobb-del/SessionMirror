import { Camera, Mic, Settings } from 'lucide-react'
import Pressable from './ui/Pressable'
import type { RecordingMode } from '../types'

export default function RecordingHeader({ mode, disabled, onModeChange, onSettings, hapticFeedback }: {
  mode: RecordingMode
  disabled: boolean
  onModeChange: (mode: RecordingMode) => void
  onSettings?: () => void
  hapticFeedback: boolean
}) {
  return <header className="open-lens-header">
    <div className="open-lens-modes" role="group" aria-label="Recording mode">
      {(['audio', 'video'] as const).map(value => <Pressable key={value} disabled={disabled}
        aria-pressed={mode === value} onClick={() => onModeChange(value)} hapticFeedback={hapticFeedback}>
        {value === 'audio' ? <Mic aria-hidden /> : <Camera aria-hidden />}<span>{value === 'audio' ? 'Audio' : 'Video'}</span>
      </Pressable>)}
    </div>
    {onSettings && <Pressable className="open-lens-settings" disabled={disabled} aria-label="Open settings" data-tutorial="settings-button" onClick={onSettings} hapticFeedback={hapticFeedback}><Settings aria-hidden /></Pressable>}
  </header>
}
