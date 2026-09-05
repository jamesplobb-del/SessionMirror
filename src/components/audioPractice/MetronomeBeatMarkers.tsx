import { type MetronomeAccentLevel } from '../../utils/metronomeConfig'
import { triggerLightHaptic } from '../../utils/haptics'

/**
 * The bar drawn as numbered beats: where the click is now, which beats are
 * accented, and how the beat is subdivided.
 *
 * Shared by the Metronome tab and the floating widget so the same bar reads
 * the same way in both places — the widget only shrinks it with CSS.
 */
export default function MetronomeBeatMarkers({
  interactive,
  playing,
  beatIndex,
  subTickIndex,
  beatPulseId,
  beatsPerBar,
  accentLevels,
  subNotchCount,
  toggleBeatAccent,
}: {
  interactive: boolean
  playing: boolean
  beatIndex: number
  subTickIndex: number
  beatPulseId: number
  beatsPerBar: number
  accentLevels: readonly MetronomeAccentLevel[]
  subNotchCount: number
  toggleBeatAccent: (index: number) => void
}) {
  return (
    <div
      className={`metronome-beat-markers ${beatsPerBar > 8 ? 'metronome-beat-markers--compact' : ''} ${playing ? 'metronome-beat-markers--playing' : ''}`}
      role="group"
      aria-label="Beat accents"
    >
      {Array.from({ length: beatsPerBar }, (_, index) => {
        const level = accentLevels[index] ?? 'weak'
        const active = playing && beatIndex === index
        const mainTick = active && subTickIndex === 0
        const subTick = active && subTickIndex > 0
        const accented = level === 'strong' || level === 'medium'
        const classes = [
          'metronome-beat-marker',
          index === 0 ? 'metronome-beat-marker--downbeat' : '',
          accented ? 'metronome-beat-marker--accented' : '',
          level === 'silent' ? 'metronome-beat-marker--silent' : '',
          mainTick ? 'metronome-beat-marker--active' : '',
          subTick ? 'metronome-beat-marker--sub-active' : '',
        ]
          .filter(Boolean)
          .join(' ')
        const content = (
          <>
            <span className="metronome-beat-marker__halo" aria-hidden />
            <span className="metronome-beat-marker__number" aria-hidden>{index + 1}</span>
          </>
        )

        return (
          <div key={`${index}-${mainTick ? beatPulseId : 'idle'}`} className="metronome-beat-marker__cell">
            {interactive ? (
              <button
                type="button"
                className={`${classes} pointer-events-auto`}
                aria-label={`Beat ${index + 1}, ${level}. Tap to change accent.`}
                aria-pressed={accented}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => {
                  if (event.button !== 0) return
                  triggerLightHaptic()
                  toggleBeatAccent(index)
                }}
              >
                {content}
              </button>
            ) : (
              <div className={classes}>{content}</div>
            )}
            {subNotchCount > 0 ? (
              <div className="metronome-beat-marker__sub-notches" aria-hidden>
                {Array.from({ length: subNotchCount }, (_, notchIndex) => (
                  <span
                    key={notchIndex}
                    className={`metronome-beat-marker__sub-notch ${active && subTickIndex === notchIndex + 1 ? 'metronome-beat-marker__sub-notch--active' : ''}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
