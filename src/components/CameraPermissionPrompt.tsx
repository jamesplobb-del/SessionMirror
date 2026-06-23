import { Camera, Mic } from 'lucide-react'
import type { RecordingMode } from '../types'

interface CameraPermissionPromptProps {
  recordingMode: RecordingMode
  requesting: boolean
  onRequestPermission: () => void
}

export default function CameraPermissionPrompt({
  recordingMode,
  requesting,
  onRequestPermission,
}: CameraPermissionPromptProps) {
  const isAudioMode = recordingMode === 'audio'
  const PermissionIcon = isAudioMode ? Mic : Camera

  return (
    <div className="camera-permission-gate" role="dialog" aria-modal="true">
      <div className="camera-permission-gate__panel">
        <div className="camera-permission-gate__icon-wrap">
          <PermissionIcon className="h-7 w-7 text-white/80" aria-hidden />
        </div>
        <p className="camera-permission-gate__message">
          {isAudioMode
            ? 'Microphone access is required to record audio takes.'
            : 'Camera and microphone access are required to record takes.'}
        </p>
        <button
          type="button"
          disabled={requesting}
          onClick={onRequestPermission}
          className="camera-permission-gate__button"
        >
          {requesting ? 'Requesting access…' : 'Tap to Enable Camera/Microphone'}
        </button>
      </div>
    </div>
  )
}
