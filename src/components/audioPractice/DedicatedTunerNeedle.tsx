import { useEffect, useRef } from 'react'
import type { DedicatedTunerStatus } from './dedicatedTunerConfig'

const NEEDLE_RANGE_CENTS = 50
const IN_TUNE_CENTS = 5

interface DedicatedTunerNeedleProps {
  cents: number
  active: boolean
  status: DedicatedTunerStatus
  inTuneGlow?: number
}

function centsToAngleRadians(cents: number): number {
  const clamped = Math.max(-NEEDLE_RANGE_CENTS, Math.min(NEEDLE_RANGE_CENTS, cents))
  const t = (clamped + NEEDLE_RANGE_CENTS) / (NEEDLE_RANGE_CENTS * 2)
  return Math.PI * (1 - t)
}

export default function DedicatedTunerNeedle({
  cents,
  active,
  status,
  inTuneGlow = 0,
}: DedicatedTunerNeedleProps) {
  const displayCentsRef = useRef(0)
  const needleRef = useRef<SVGGElement>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const step = () => {
      const target = active ? cents : 0
      const current = displayCentsRef.current
      const next = current + (target - current) * 0.16
      displayCentsRef.current =
        Math.abs(next - target) < 0.08 ? target : next

      const angle = centsToAngleRadians(displayCentsRef.current)
      const angleDeg = (angle * 180) / Math.PI - 90
      needleRef.current?.setAttribute('transform', `rotate(${angleDeg} 120 118)`)

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [active, cents])

  const inTune = status === 'in-tune'
  const glowBoost = Math.min(1, inTuneGlow)

  const greenStart = centsToAngleRadians(IN_TUNE_CENTS)
  const greenEnd = centsToAngleRadians(-IN_TUNE_CENTS)

  const arcPoint = (angle: number, radius: number) => {
    const x = 120 + radius * Math.cos(angle)
    const y = 118 - radius * Math.sin(angle)
    return { x, y }
  }

  const describeArc = (startAngle: number, endAngle: number, radius: number) => {
    const start = arcPoint(startAngle, radius)
    const end = arcPoint(endAngle, radius)
    const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
  }

  const trackPath = describeArc(Math.PI, 0, 92)
  const inTunePath = describeArc(greenEnd, greenStart, 92)

  return (
    <div
      className={[
        'dedicated-tuner-needle',
        inTune ? 'dedicated-tuner-needle--locked' : '',
        active ? 'dedicated-tuner-needle--active' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <svg className="dedicated-tuner-needle__svg" viewBox="0 0 240 132" role="presentation">
        <defs>
          <linearGradient id="dedicated-tuner-track" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(251, 191, 36, 0.35)" />
            <stop offset="50%" stopColor="rgba(52, 211, 153, 0.45)" />
            <stop offset="100%" stopColor="rgba(251, 191, 36, 0.35)" />
          </linearGradient>
        </defs>

        <path
          d={trackPath}
          fill="none"
          stroke="url(#dedicated-tuner-track)"
          strokeWidth="10"
          strokeLinecap="round"
          opacity="0.55"
        />

        <path
          d={inTunePath}
          fill="none"
          stroke="rgba(52, 211, 153, 0.85)"
          strokeWidth="12"
          strokeLinecap="round"
          opacity={inTune ? 0.55 + glowBoost * 0.35 : 0.28}
        />

        <line x1="34" y1="118" x2="52" y2="118" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
        <line x1="188" y1="118" x2="206" y2="118" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
        <line x1="118" y1="18" x2="122" y2="34" stroke="rgba(52, 211, 153, 0.5)" strokeWidth="2" />

        <text x="28" y="128" fill="rgba(255,255,255,0.38)" fontSize="10" fontWeight="600">
          ♭
        </text>
        <text x="206" y="128" fill="rgba(255,255,255,0.38)" fontSize="10" fontWeight="600">
          ♯
        </text>

        <g ref={needleRef}>
          <line
            x1="120"
            y1="118"
            x2="120"
            y2="26"
            stroke={inTune ? '#34d399' : active ? '#f8fafc' : 'rgba(255,255,255,0.35)'}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle
            cx="120"
            cy="118"
            r="7"
            fill={inTune ? '#34d399' : '#0f172a'}
            stroke={inTune ? '#6ee7b7' : 'rgba(255,255,255,0.45)'}
            strokeWidth="2"
          />
        </g>
      </svg>
    </div>
  )
}
