import { useId } from 'react'

interface RecordOrbitIconProps {
  recording?: boolean
}

export default function RecordOrbitIcon({ recording = false }: RecordOrbitIconProps) {
  const id = useId().replace(/:/g, '')
  const ringGradientId = `record-orbit-ring-${id}`
  const dotGradientId = `record-orbit-dot-${id}`

  return (
    <span
      className={`record-orbit-icon ${recording ? 'record-orbit-icon--recording' : ''}`}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" className="record-orbit-icon__svg" fill="none">
        <defs>
          <linearGradient
            id={ringGradientId}
            x1="0"
            y1="32"
            x2="64"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="var(--sm-gold, #f7a600)" />
            <stop offset="50%" stopColor="var(--sm-gold, #f7a600)" />
            <stop offset="50%" stopColor="var(--sm-blue, #1598ff)" />
            <stop offset="100%" stopColor="var(--sm-blue, #1598ff)" />
          </linearGradient>
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
            r="28"
            stroke={`url(#${ringGradientId})`}
            strokeWidth="1.55"
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
