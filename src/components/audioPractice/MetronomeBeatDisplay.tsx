import { useEffect, useState, type CSSProperties } from 'react'
import { useMetronome } from '../../hooks/useMetronome'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { subTicksPerPulse } from '../../utils/metronomeConfig'
import { triggerLightHaptic } from '../../utils/haptics'
import { useMetronomeVisualStyle } from '../../utils/metronomeVisualStyle'

interface MetronomeBeatDisplayProps {
  /** When false, beat accents are not interactive (practice session). */
  interactive?: boolean
}

/**
 * Monotonic count of main beats since playback started. Both the pendulum and
 * the orbit animate off this rather than off beatIndex — beatIndex wraps to 0
 * at the bar line, which would snap the pendulum back mid-swing and spin the
 * orbit dot backwards a full lap.
 */
function useBeatTick(playing: boolean, beatPulseId: number, subTickIndex: number): number {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!playing || subTickIndex !== 0) return
    setTick((current) => current + 1)
  }, [beatPulseId, playing, subTickIndex])

  useEffect(() => {
    if (!playing) setTick(0)
  }, [playing])

  return tick
}

export default function MetronomeBeatDisplay({ interactive = true }: MetronomeBeatDisplayProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const visualStyle = useMetronomeVisualStyle()
  const {
    meter,
    subdivision,
    bpm,
    playing,
    beatIndex,
    subTickIndex,
    beatPulseId,
    accentLevels,
    pulseCount,
    compound,
    toggleBeatAccent,
  } = useMetronome()

  const beatTick = useBeatTick(playing, beatPulseId, subTickIndex)
  // One beat of travel, so the pendulum reaches its extreme (and the orbit dot
  // its next marker) exactly as the following click fires.
  const beatSeconds = 60 / Math.max(1, bpm)
  const travelMs = prefersReducedMotion ? 0 : Math.round(beatSeconds * 1000)

  const beatsPerBar = pulseCount
  const compoundMeter = compound
  const subNotchCount = subTicksPerPulse(meter, subdivision, pulseCount)
  const beatColumns = beatsPerBar > 8 ? Math.ceil(beatsPerBar / 2) : beatsPerBar

  const isMainBeatPulse = playing && subTickIndex === 0
  const activeLevel = accentLevels[beatIndex] ?? 'weak'
  const isAccentedPulse = isMainBeatPulse && activeLevel !== 'weak' && activeLevel !== 'silent'
  const pulseClass = isAccentedPulse
    ? beatIndex === 0
      ? 'audio-practice-metronome__pulse--accent'
      : 'audio-practice-metronome__pulse--beat'
    : 'audio-practice-metronome__pulse--beat'

  const tempoLabel = `${bpm} beats per minute, ${beatsPerBar} beats per bar`

  if (visualStyle === 'pendulum' || visualStyle === 'orbit') {
    return (
      <div className="audio-practice-metronome__center-stack min-h-0 flex-1">
        <div
          className="metronome-audio-stage__beats min-h-0 flex-1"
          aria-live="polite"
          aria-atomic
        >
          <div
            className={`audio-practice-metronome__visual audio-practice-metronome__visual--large metronome-visual metronome-visual--${visualStyle}`}
            role="img"
            aria-label={tempoLabel}
          >
            {visualStyle === 'pendulum' ? (
              <PendulumVisual
                beatTick={beatTick}
                playing={playing}
                travelMs={travelMs}
                accented={isAccentedPulse}
                downbeat={isMainBeatPulse && beatIndex === 0}
              />
            ) : (
              <OrbitVisual
                beatTick={beatTick}
                beatsPerBar={beatsPerBar}
                beatIndex={beatIndex}
                accentLevels={accentLevels}
                playing={playing}
                travelMs={travelMs}
                pulsing={isMainBeatPulse}
                downbeat={isMainBeatPulse && beatIndex === 0}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="audio-practice-metronome__center-stack min-h-0 flex-1">
      <div className="metronome-audio-stage__beats min-h-0 flex-1" aria-live="polite" aria-atomic>
        <div className="audio-practice-metronome__visual audio-practice-metronome__visual--large">
          <div
            key={beatPulseId}
            className={[
              'audio-practice-metronome__pulse',
              playing ? pulseClass : '',
              playing && beatPulseId > 0 && !prefersReducedMotion
                ? 'audio-practice-metronome__pulse--animate'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden
          />
          <div
            className={[
              'metronome-audio-stage__beat-row',
              'audio-practice-metronome__beat-row',
              compoundMeter ? 'audio-practice-metronome__beat-row--compound' : '',
              beatsPerBar > 8 ? 'audio-practice-metronome__beat-row--compact' : '',
              beatsPerBar > 8
                ? 'audio-practice-metronome__beat-row--two-line'
                : 'audio-practice-metronome__beat-row--single-line',
              beatsPerBar <= 6 ? 'audio-practice-metronome__beat-row--spacious' : '',
              playing ? 'metronome-audio-stage__beat-row--playing' : '',
              prefersReducedMotion ? 'metronome-audio-stage__beat-row--reduced-motion' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--beat-columns': beatColumns } as CSSProperties}
            role="group"
            aria-label="Beat indicators"
          >
            {Array.from({ length: beatsPerBar }, (_, index) => {
              const level = accentLevels[index] ?? 'weak'
              const isBeatActive = playing && beatIndex === index
              const isAccented = level === 'strong' || level === 'medium'
              const isSilent = level === 'silent'
              const isDownbeat = index === 0 && level === 'strong'
              const isMainTick = isBeatActive && subTickIndex === 0
              const isSubTick = isBeatActive && subTickIndex > 0

              const beatClassName = [
                'audio-practice-metronome__beat',
                interactive ? 'audio-practice-metronome__beat-tap pointer-events-auto' : '',
                isSilent ? 'audio-practice-metronome__beat--silent' : '',
                isAccented ? 'audio-practice-metronome__beat--accented' : '',
                level === 'strong' ? 'audio-practice-metronome__beat--strong' : '',
                level === 'medium' ? 'audio-practice-metronome__beat--medium' : '',
                isMainTick ? 'audio-practice-metronome__beat--active' : '',
                isSubTick ? 'audio-practice-metronome__beat--sub-active' : '',
                isDownbeat ? 'audio-practice-metronome__beat--downbeat' : '',
                isMainTick && isAccented && index === 0 ? 'audio-practice-metronome__beat--pulse' : '',
                isMainTick && isAccented && index > 0
                  ? 'audio-practice-metronome__beat--pulse-soft'
                  : '',
                isMainTick && !isAccented && !isSilent ? 'audio-practice-metronome__beat--pulse-soft' : '',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <div
                  key={`${index}-${isBeatActive ? beatPulseId : 'idle'}`}
                  className={[
                    'audio-practice-metronome__beat-cell',
                    compoundMeter ? 'audio-practice-metronome__beat-cell--compound' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {interactive ? (
                    <button
                      type="button"
                      className={beatClassName}
                      aria-label={`Beat ${index + 1}, ${level}. Tap to change accent.`}
                      aria-pressed={isAccented}
                      onPointerUp={(event) => {
                        if (event.button !== 0) return
                        triggerLightHaptic()
                        toggleBeatAccent(index)
                      }}
                    >
                      <span className="audio-practice-metronome__beat-number" aria-hidden>
                        {index + 1}
                      </span>
                    </button>
                  ) : (
                    <div className={beatClassName} aria-hidden>
                      <span className="audio-practice-metronome__beat-number">{index + 1}</span>
                    </div>
                  )}
                  {subNotchCount > 0 ? (
                    <div className="audio-practice-metronome__sub-notches" aria-hidden>
                      {Array.from({ length: subNotchCount }, (_, notchIndex) => {
                        const notchTick = notchIndex + 1
                        const notchActive = isBeatActive && subTickIndex === notchTick
                        return (
                          <span
                            key={notchTick}
                            className={[
                              'audio-practice-metronome__sub-notch',
                              notchActive ? 'audio-practice-metronome__sub-notch--active' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          />
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Swing amplitude in degrees, each side of vertical. */
const PENDULUM_SWING_DEG = 27

/**
 * A classic wind-up metronome arm. The arm alternates sides on every beat and
 * takes exactly one beat to cross, so the swing rate *is* the tempo — the most
 * literal way to read BPM with no sound.
 */
function PendulumVisual({
  beatTick,
  playing,
  travelMs,
  accented,
  downbeat,
}: {
  beatTick: number
  playing: boolean
  travelMs: number
  accented: boolean
  downbeat: boolean
}) {
  // Rest upright until the first beat lands, then alternate sides.
  const angle = !playing || beatTick === 0 ? 0 : beatTick % 2 === 0 ? -PENDULUM_SWING_DEG : PENDULUM_SWING_DEG

  return (
    <div className="metronome-pendulum" aria-hidden>
      <div className="metronome-pendulum__scale">
        <span className="metronome-pendulum__tick metronome-pendulum__tick--left" />
        <span className="metronome-pendulum__tick metronome-pendulum__tick--center" />
        <span className="metronome-pendulum__tick metronome-pendulum__tick--right" />
      </div>
      <div
        className="metronome-pendulum__arm"
        style={{
          transform: `rotate(${angle}deg)`,
          transitionDuration: `${travelMs}ms`,
        }}
      >
        <span
          className={[
            'metronome-pendulum__weight',
            downbeat ? 'metronome-pendulum__weight--downbeat' : '',
            accented && !downbeat ? 'metronome-pendulum__weight--accent' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
      <div
        className={[
          'metronome-pendulum__pivot',
          playing && downbeat ? 'metronome-pendulum__pivot--downbeat' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </div>
  )
}

/**
 * A dot running a lap of the bar, one marker per beat. Position around the ring
 * shows *where* you are in the bar, and the constant angular speed shows the
 * tempo. The rotation accumulates rather than wrapping, so the dot never spins
 * backwards at the bar line.
 */
function OrbitVisual({
  beatTick,
  beatsPerBar,
  beatIndex,
  accentLevels,
  playing,
  travelMs,
  pulsing,
  downbeat,
}: {
  beatTick: number
  beatsPerBar: number
  beatIndex: number
  accentLevels: readonly string[]
  playing: boolean
  travelMs: number
  pulsing: boolean
  downbeat: boolean
}) {
  const step = 360 / Math.max(1, beatsPerBar)
  // Monotonic: keeps turning forward through the bar line.
  const rotation = playing ? (beatTick - 1) * step : 0

  return (
    <div className="metronome-orbit" aria-hidden>
      <div className="metronome-orbit__ring">
        {Array.from({ length: beatsPerBar }, (_, index) => {
          const level = accentLevels[index] ?? 'weak'
          const isActive = playing && beatIndex === index
          return (
            <span
              key={index}
              className={[
                'metronome-orbit__marker',
                level === 'strong' ? 'metronome-orbit__marker--strong' : '',
                level === 'medium' ? 'metronome-orbit__marker--medium' : '',
                level === 'silent' ? 'metronome-orbit__marker--silent' : '',
                isActive ? 'metronome-orbit__marker--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                transform: `rotate(${index * step}deg) translateY(calc(var(--orbit-radius) * -1))`,
              }}
            >
              {/* The marker's own rotation is what places it on the ring, so the
                  digit has to be spun back the same amount to stay upright. */}
              <b style={{ transform: `rotate(${-index * step}deg)` }}>{index + 1}</b>
            </span>
          )
        })}

        <div
          className="metronome-orbit__hand"
          style={{
            transform: `rotate(${rotation}deg)`,
            transitionDuration: `${travelMs}ms`,
          }}
        >
          <span className="metronome-orbit__dot" />
        </div>

        <div
          className={[
            'metronome-orbit__core',
            playing && pulsing ? 'metronome-orbit__core--pulse' : '',
            downbeat ? 'metronome-orbit__core--downbeat' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
    </div>
  )
}
