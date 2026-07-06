import { useMetronome } from '../../hooks/useMetronome'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { subTicksPerPulse } from '../../utils/metronomeConfig'
import { triggerLightHaptic } from '../../utils/haptics'

interface MetronomeBeatDisplayProps {
  /** When false, beat accents are not interactive (practice session). */
  interactive?: boolean
}

export default function MetronomeBeatDisplay({ interactive = true }: MetronomeBeatDisplayProps) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const {
    meter,
    subdivision,
    playing,
    beatIndex,
    subTickIndex,
    beatPulseId,
    accentLevels,
    pulseCount,
    compound,
    toggleBeatAccent,
  } = useMetronome()

  const beatsPerBar = pulseCount
  const compoundMeter = compound
  const subNotchCount = subTicksPerPulse(meter, subdivision, pulseCount)

  const isMainBeatPulse = playing && subTickIndex === 0
  const activeLevel = accentLevels[beatIndex] ?? 'weak'
  const isAccentedPulse = isMainBeatPulse && activeLevel !== 'weak' && activeLevel !== 'silent'
  const pulseClass = isAccentedPulse
    ? beatIndex === 0
      ? 'audio-practice-metronome__pulse--accent'
      : 'audio-practice-metronome__pulse--beat'
    : 'audio-practice-metronome__pulse--beat'

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
              playing ? 'metronome-audio-stage__beat-row--playing' : '',
              prefersReducedMotion ? 'metronome-audio-stage__beat-row--reduced-motion' : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
