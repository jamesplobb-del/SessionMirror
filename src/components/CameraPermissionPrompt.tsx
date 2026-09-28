import { Camera, Mic } from 'lucide-react'
import type { RecordingMode } from '../types'

interface CameraPermissionPromptProps {
  recordingMode: RecordingMode
  requesting: boolean
  blocked: boolean
  onRequestPermission: () => void
  onOpenSettings: () => void
  /** Video mode only: lets a player who declined just the camera keep recording audio. */
  onUseAudioOnly?: () => void
}

export default function CameraPermissionPrompt({
  recordingMode,
  requesting,
  blocked,
  onRequestPermission,
  onOpenSettings,
  onUseAudioOnly,
}: CameraPermissionPromptProps) {
  const isAudioMode = recordingMode === 'audio'
  const PermissionIcon = isAudioMode ? Mic : Camera

  return (
    <div className="camera-permission-gate" role="region" aria-label="Recording permissions">
      <div className="camera-permission-gate__panel">
        <div className="camera-permission-gate__icon-wrap">
          <PermissionIcon className="h-7 w-7 text-white/80" aria-hidden />
        </div>
        <p className="camera-permission-gate__message">
          {blocked
            ? isAudioMode
              ? 'Microphone access is off. Enable it in iOS Settings to record audio.'
              : 'Video takes need both the camera and microphone. Turn on whichever is off in iOS Settings, or record audio only.'
            : isAudioMode
            ? 'Microphone access is required to record audio takes.'
            : 'Video takes need the camera and microphone. You can also record audio only.'}
        </p>
        <button
          type="button"
          disabled={requesting}
          onClick={blocked ? onOpenSettings : onRequestPermission}
          className="camera-permission-gate__button"
        >
          {requesting
            ? 'Requesting access…'
            : blocked
              ? 'Open iOS Settings'
              : isAudioMode ? 'Enable Microphone' : 'Enable Camera/Microphone'}
        </button>
        {blocked && (
          <button
            type="button"
            disabled={requesting}
            onClick={onRequestPermission}
            className="camera-permission-gate__retry"
          >
            Try Again
          </button>
        )}
        {!isAudioMode && onUseAudioOnly && (
          <button
            type="button"
            disabled={requesting}
            onClick={onUseAudioOnly}
            className="camera-permission-gate__retry"
          >
            Record audio only
          </button>
        )}
      </div>
    </div>
  )
}
