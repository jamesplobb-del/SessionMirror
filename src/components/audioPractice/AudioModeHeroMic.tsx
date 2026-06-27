import { memo } from 'react'

interface AudioModeHeroMicProps {
  isRecording: boolean
}

const TICK_COUNT = 72

function AudioModeHeroMic({ isRecording }: AudioModeHeroMicProps) {
  const ticks = Array.from({ length: TICK_COUNT }, (_, index) => {
    const angle = (index / TICK_COUNT) * 360 - 90
    const isGold = angle >= -90 && angle < 90
    return { angle, isGold }
  })

  const placeholderBars = [0.35, 0.55, 0.72, 0.88, 0.95, 0.88, 0.72, 0.55, 0.35]

  return (
    <div
      className={`audio-mode-hero-mic ${isRecording ? 'audio-mode-hero-mic--recording' : ''}`}
      aria-hidden
    >
      <div className="audio-mode-hero-mic__dial">
        <svg className="audio-mode-hero-mic__ticks" viewBox="0 0 200 200" aria-hidden>
          {ticks.map((tick, index) => {
            const rad = (tick.angle * Math.PI) / 180
            const innerR = 86
            const outerR = 94
            const x1 = 100 + innerR * Math.cos(rad)
            const y1 = 100 + innerR * Math.sin(rad)
            const x2 = 100 + outerR * Math.cos(rad)
            const y2 = 100 + outerR * Math.sin(rad)
            return (
              <line
                key={index}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={tick.isGold ? '#F7A600' : '#1598FF'}
                strokeWidth={1.15}
                strokeLinecap="round"
                opacity={0.85}
              />
            )
          })}
        </svg>

        <div className="audio-mode-hero-mic__ring" />

        <div className="audio-mode-hero-mic__core">
          <svg
            className="audio-mode-hero-mic__icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <defs>
              <linearGradient id="audio-mic-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F7A600" />
                <stop offset="100%" stopColor="#1598FF" />
              </linearGradient>
            </defs>
            <rect x="9" y="3" width="6" height="11" rx="3" stroke="url(#audio-mic-gradient)" strokeWidth="1.75" />
            <path
              d="M6 11a6 6 0 0 0 12 0"
              stroke="url(#audio-mic-gradient)"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <path d="M12 17v3.5" stroke="url(#audio-mic-gradient)" strokeWidth="1.75" strokeLinecap="round" />
            <path d="M8.5 20.5h7" stroke="url(#audio-mic-gradient)" strokeWidth="1.75" strokeLinecap="round" />
          </svg>

          <div className="audio-mode-hero-mic__mini-wave">
            {placeholderBars.map((height, index) => (
              <span
                key={index}
                className={
                  index < placeholderBars.length / 2
                    ? 'audio-mode-hero-mic__mini-bar audio-mode-hero-mic__mini-bar--gold'
                    : 'audio-mode-hero-mic__mini-bar audio-mode-hero-mic__mini-bar--blue'
                }
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(AudioModeHeroMic)
