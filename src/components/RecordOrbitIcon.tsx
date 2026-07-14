import { useId } from 'react'

interface RecordOrbitIconProps {
  recording?: boolean
}

export default function RecordOrbitIcon({ recording = false }: RecordOrbitIconProps) {
  const id = useId().replace(/:/g, '')
  const dotGradientId = `record-orbit-dot-${id}`

  return (
    <span
      className={`record-orbit-icon ${recording ? 'record-orbit-icon--recording' : ''}`}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="record-orbit-icon__svg" fill="none">
        <defs>
          <radialGradient id={dotGradientId} cx="38%" cy="32%" r="72%">
            <stop offset="0%" stopColor="#ff9a5c" />
            <stop offset="55%" stopColor="#ff4d4d" />
            <stop offset="100%" stopColor="#e11d48" />
          </radialGradient>
        </defs>

        <g className="record-orbit-icon__ring-group">
          <circle
            className="record-orbit-icon__ring"
            cx="32"
            cy="32"
            r="28.5"
          />
        </g>

        {recording ? (
          <rect
            className="record-orbit-icon__stop"
            x="24"
            y="24"
            width="16"
            height="16"
            rx="2.75"
            fill={`url(#${dotGradientId})`}
          />
        ) : (
          <circle
            className="record-orbit-icon__dot"
            cx="32"
            cy="32"
            r="7.25"
            fill={`url(#${dotGradientId})`}
          />
        )}
      </svg>
    </span>
  )
}
