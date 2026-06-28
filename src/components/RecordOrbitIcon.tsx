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
      <svg viewBox="0 0 56 56" className="record-orbit-icon__svg" fill="none">
        <defs>
          <linearGradient
            id={ringGradientId}
            x1="0"
            y1="28"
            x2="56"
            y2="28"
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

        <g className="record-orbit-icon__ring-group record-orbit-icon__ring-group--outer">
          <circle
            className="record-orbit-icon__ring record-orbit-icon__ring--outer"
            cx="28"
            cy="28"
            r="24.75"
            stroke={`url(#${ringGradientId})`}
            strokeWidth="1.45"
          />
        </g>

        <g className="record-orbit-icon__ring-group record-orbit-icon__ring-group--inner">
          <circle
            className="record-orbit-icon__ring record-orbit-icon__ring--inner"
            cx="28"
            cy="28"
            r="18.75"
            stroke={`url(#${ringGradientId})`}
            strokeWidth="1.3"
          />
        </g>

        {recording ? (
          <rect
            className="record-orbit-icon__stop"
            x="21.25"
            y="21.25"
            width="13.5"
            height="13.5"
            rx="2.5"
            fill={`url(#${dotGradientId})`}
          />
        ) : (
          <circle
            className="record-orbit-icon__dot"
            cx="28"
            cy="28"
            r="5.75"
            fill={`url(#${dotGradientId})`}
          />
        )}
      </svg>
    </span>
  )
}
