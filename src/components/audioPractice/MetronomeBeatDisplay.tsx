import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useMetronome } from '../../hooks/useMetronome'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { subTicksPerPulse, type MetronomeAccentLevel } from '../../utils/metronomeConfig'
import { triggerLightHaptic } from '../../utils/haptics'
import {
  useMetronomeVisualStyle,
  type MetronomeVisualStyle,
} from '../../utils/metronomeVisualStyle'

interface MetronomeBeatDisplayProps {
  /** When false, beat accents are not interactive (practice session). */
  interactive?: boolean
}

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

/** Height above the floor. Lands on 0 at the click, hangs, then falls. */
function gravityHeight(beatFraction: number, peak: number): number {
  if (beatFraction <= 0) return 0
  if (beatFraction < 0.16) {
    const t = beatFraction / 0.16
    return peak * (1 - (1 - t) ** 3)
  }
  const t = (beatFraction - 0.16) / 0.84
  return peak * (1 - t ** 2.4)
}

function landingSquash(beatFraction: number): number {
  if (beatFraction < 0.1) return 0.7 + (beatFraction / 0.1) * 0.3
  if (beatFraction > 0.88) return 1 - ((beatFraction - 0.88) / 0.12) * 0.3
  return 1
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
    toggleBeatAccent,
  } = useMetronome()

  const beatTick = useBeatTick(playing, beatPulseId, subTickIndex)
  const beatDurationMs = Math.round((60 / Math.max(1, bpm)) * 1000)
  const travelMs = prefersReducedMotion ? 0 : beatDurationMs
  const subNotchCount = subTicksPerPulse(meter, subdivision, pulseCount)
  const tempoLabel = `${bpm} beats per minute, ${pulseCount} beats per bar`
  const activeLevel = accentLevels[beatIndex] ?? 'weak'
  const isDownbeat = playing && subTickIndex === 0 && beatIndex === 0
  const glowTone =
    beatIndex === 0 ? 'gold' : activeLevel === 'strong' || activeLevel === 'medium' ? 'blue-strong' : 'blue'
  const stageStyle = {
    '--beat-duration': `${travelMs}ms`,
    '--beat-columns': pulseCount > 8 ? Math.ceil(pulseCount / 2) : pulseCount,
  } as CSSProperties

  return (
    <div className="audio-practice-metronome__center-stack min-h-0 flex-1">
      <div className="metronome-audio-stage__beats min-h-0 flex-1" aria-live="polite" aria-atomic>
        <div
          className={`audio-practice-metronome__visual audio-practice-metronome__visual--large metronome-live-stage metronome-live-stage--${visualStyle} ${playing ? 'metronome-live-stage--playing' : 'metronome-live-stage--idle'}`}
          style={stageStyle}
        >
          {/*
            * The stage breathes with the click. Re-keyed on the beat so the
            * animation restarts exactly when the sound does, which keeps it
            * locked to the engine instead of drifting the way a free-running
            * CSS loop would. Gold on the downbeat, blue elsewhere — the same
            * language the beat markers use.
            */}
          {playing ? (
            <span
              key={beatTick}
              className={`metronome-live-stage__glow metronome-pulse-tone--${glowTone}`}
              aria-hidden
            />
          ) : null}

          <div
            className="metronome-live-stage__canvas"
            role="img"
            aria-label={`${tempoLabel}. ${visualLabel(visualStyle)} view.`}
          >
            <MetronomeVisual
              style={visualStyle}
              playing={playing}
              pulseKey={beatTick}
              beatIndex={beatIndex}
              beatsPerBar={pulseCount}
              accentLevels={accentLevels}
              downbeat={isDownbeat}
              accented={activeLevel === 'strong' || activeLevel === 'medium'}
              beatDurationMs={beatDurationMs}
              reducedMotion={prefersReducedMotion}
            />
          </div>

          <BeatMarkers
            interactive={interactive}
            playing={playing}
            beatIndex={beatIndex}
            subTickIndex={subTickIndex}
            beatPulseId={beatPulseId}
            beatsPerBar={pulseCount}
            accentLevels={accentLevels}
            subNotchCount={subNotchCount}
            toggleBeatAccent={toggleBeatAccent}
          />
        </div>
      </div>
    </div>
  )
}

function visualLabel(style: MetronomeVisualStyle): string {
  switch (style) {
    case 'vertical':
      return 'Vertical Bounce'
    case 'horizontal':
      return 'Horizontal Bounce'
    case 'columns':
      return 'Pulse Columns'
    case 'pulse':
      return 'Stage Pulse'
    default:
      return 'Pulse Ribbon'
  }
}

function MetronomeVisual({
  style,
  playing,
  pulseKey,
  beatIndex,
  beatsPerBar,
  accentLevels,
  downbeat,
  accented,
  beatDurationMs,
  reducedMotion,
}: {
  style: MetronomeVisualStyle
  playing: boolean
  pulseKey: number
  beatIndex: number
  beatsPerBar: number
  accentLevels: readonly MetronomeAccentLevel[]
  downbeat: boolean
  accented: boolean
  beatDurationMs: number
  reducedMotion: boolean
}) {
  const pulseTone = downbeat ? 'gold' : accented ? 'blue-strong' : 'blue'

  if (style === 'vertical') {
    return (
      <div className={`metronome-bounce metronome-bounce--vertical metronome-pulse-tone--${pulseTone}`}>
        <div className="metronome-bounce__guide" />
        <span key={pulseKey} className="metronome-bounce__orb" />
        <span key={`impact-${pulseKey}`} className="metronome-bounce__impact" />
      </div>
    )
  }

  if (style === 'horizontal') {
    return (
      <div
        className={`metronome-bounce metronome-bounce--horizontal metronome-bounce--direction-${pulseKey % 2 === 0 ? 'left' : 'right'} metronome-pulse-tone--${pulseTone}`}
      >
        <div className="metronome-bounce__guide" />
        <span className="metronome-bounce__station metronome-bounce__station--start" />
        <span className="metronome-bounce__station metronome-bounce__station--end" />
        <span key={pulseKey} className="metronome-bounce__orb" />
        <span key={`impact-${pulseKey}`} className="metronome-bounce__impact" />
      </div>
    )
  }

  if (style === 'columns') {
    return (
      <div
        className={`metronome-columns ${beatsPerBar > 8 ? 'metronome-columns--compact' : ''}`}
        style={{ '--column-count': beatsPerBar } as CSSProperties}
      >
        {Array.from({ length: beatsPerBar }, (_, index) => {
          const level = accentLevels[index] ?? 'weak'
          const active = playing && beatIndex === index
          const elapsed = playing && index < beatIndex
          return (
            <span
              key={`${index}-${active ? pulseKey : 'idle'}`}
              className={`metronome-columns__column ${index === 0 ? 'metronome-columns__column--downbeat' : ''} ${level === 'silent' ? 'metronome-columns__column--silent' : ''} ${active ? 'metronome-columns__column--active' : ''} ${elapsed ? 'metronome-columns__column--elapsed' : ''}`}
              style={{ '--column-index': index } as CSSProperties}
            >
              <i />
            </span>
          )
        })}
      </div>
    )
  }

  if (style === 'pulse') {
    return (
      <StagePulse playing={playing} pulseKey={pulseKey} tone={pulseTone} downbeat={downbeat} />
    )
  }

  return (
    <PulseRibbon
      playing={playing}
      pulseKey={pulseKey}
      beatDurationMs={beatDurationMs}
      reducedMotion={reducedMotion}
      tone={pulseTone}
    />
  )
}

function StagePulse({
  playing,
  pulseKey,
  tone,
  downbeat,
}: {
  playing: boolean
  pulseKey: number
  tone: 'gold' | 'blue-strong' | 'blue'
  downbeat: boolean
}) {
  return (
    <div
      className={`metronome-stage-pulse metronome-pulse-tone--${tone} ${downbeat ? 'metronome-stage-pulse--downbeat' : ''}`}
    >
      {playing ? (
        <>
          <span key={`ring-${pulseKey}`} className="metronome-stage-pulse__ring" />
          <span
            key={`ring-late-${pulseKey}`}
            className="metronome-stage-pulse__ring metronome-stage-pulse__ring--late"
          />
        </>
      ) : (
        <span className="metronome-stage-pulse__ring metronome-stage-pulse__ring--idle" />
      )}
      <span
        key={playing ? `core-${pulseKey}` : 'core-idle'}
        className={`metronome-stage-pulse__core ${playing ? 'metronome-stage-pulse__core--playing' : ''}`}
      />
    </div>
  )
}

function PulseRibbon({
  playing,
  pulseKey,
  beatDurationMs,
  reducedMotion,
  tone,
}: {
  playing: boolean
  pulseKey: number
  beatDurationMs: number
  reducedMotion: boolean
  tone: 'gold' | 'blue-strong' | 'blue'
}) {
  const id = useId().replaceAll(':', '')
  const gradientId = `metronome-ribbon-gradient-${id}`
  const pulseGradientId = `metronome-pulse-gradient-${id}`
  const glowId = `metronome-soft-glow-${id}`
  const mainPathRef = useRef<SVGPathElement>(null)
  const ghostPathRefs = useRef<Array<SVGPathElement | null>>([])
  const travelGroupRef = useRef<SVGGElement>(null)
  const travelGlowRef = useRef<SVGCircleElement>(null)
  const travelCoreRef = useRef<SVGCircleElement>(null)
  const strikeRingRef = useRef<SVGCircleElement>(null)
  const strikeDotRef = useRef<SVGCircleElement>(null)
  const dropGuideRef = useRef<SVGLineElement>(null)
  const glowStopRef = useRef<SVGStopElement>(null)
  const elapsedRef = useRef(0)
  const previousTimeRef = useRef(0)
  const beatStartedAtRef = useRef(0)

  useEffect(() => {
    beatStartedAtRef.current = performance.now()
  }, [pulseKey])

  useEffect(() => {
    let frameId = 0
    previousTimeRef.current = performance.now()
    if (beatStartedAtRef.current === 0) beatStartedAtRef.current = previousTimeRef.current

    const waveY = (x: number, time: number, impact: number, ghostOffset = 0) => {
      const breath = 0.7 + 0.3 * Math.sin(time * 0.0014 + ghostOffset)
      const pulseEnvelope = Math.exp(-Math.pow((x - 180) / 62, 2))
      const base = Math.sin(x * 0.032 + time * 0.0018 + ghostOffset) * 4.4 * breath
      const detail = Math.sin(x * 0.068 - time * 0.00135 + ghostOffset * 1.7) * 1.8
      const pulse = Math.sin((x - 180) * 0.1) * impact * (tone === 'gold' ? 28 : 20) * pulseEnvelope
      return 112 + base + detail + pulse
    }

    const makePath = (time: number, impact: number, ghostOffset = 0) => {
      const pieces: string[] = []
      for (let x = 16; x <= 344; x += 4) {
        const y = waveY(x, time, impact, ghostOffset)
        pieces.push(`${x === 16 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
      }
      return pieces.join(' ')
    }

    const draw = (now: number) => {
      const delta = Math.min(64, now - previousTimeRef.current)
      previousTimeRef.current = now
      if (!reducedMotion) elapsedRef.current += delta * (playing ? 1 : 0.22)

      const beatFraction =
        playing && !reducedMotion
          ? Math.min(0.999, Math.max(0, (now - beatStartedAtRef.current) / beatDurationMs))
          : 0
      const impact = playing ? (reducedMotion ? 0.55 : Math.exp(-beatFraction * 9)) : 0
      const peak = tone === 'gold' ? 88 : 74
      const bounceHeight = playing && !reducedMotion ? gravityHeight(beatFraction, peak) : 0
      const ballY = 112 - bounceHeight
      const squash = playing && !reducedMotion ? landingSquash(beatFraction) : 1
      const elapsed = elapsedRef.current
      const pulseColor = tone === 'gold' ? '#f5a300' : '#1598ff'

      mainPathRef.current?.setAttribute('d', makePath(elapsed, impact))
      ghostPathRefs.current.forEach((path, index) => {
        if (!path) return
        const offset = (index - 2) * 0.48
        path.setAttribute('d', makePath(elapsed + index * 110, impact, offset))
        path.style.transform = `translateY(${(index - 2) * 5}px)`
      })

      const strikeY = waveY(180, elapsed, impact)
      const scaleX = (1 + (1 - squash) * 1.15).toFixed(3)
      travelGroupRef.current?.setAttribute(
        'transform',
        `translate(180 ${ballY.toFixed(1)}) scale(${scaleX} ${squash.toFixed(3)})`,
      )
      travelCoreRef.current?.setAttribute('stroke', pulseColor)
      if (travelGlowRef.current) {
        travelGlowRef.current.style.opacity = String(
          playing ? 0.5 + 0.5 * Math.exp(-beatFraction * 5.5) : 0.38,
        )
      }
      glowStopRef.current?.setAttribute('stop-color', pulseColor)
      strikeRingRef.current?.setAttribute('cy', strikeY.toFixed(1))
      strikeRingRef.current?.setAttribute('r', String(8 + impact * 36))
      if (strikeRingRef.current) {
        strikeRingRef.current.style.opacity = String(0.08 + impact * 0.9)
        strikeRingRef.current.style.stroke = pulseColor
      }
      strikeDotRef.current?.setAttribute('cy', strikeY.toFixed(1))
      if (strikeDotRef.current) {
        strikeDotRef.current.style.fill = pulseColor
        strikeDotRef.current.style.opacity = String(0.38 + impact * 0.62)
      }
      dropGuideRef.current?.setAttribute('y1', ballY.toFixed(1))
      dropGuideRef.current?.setAttribute('y2', strikeY.toFixed(1))
      if (dropGuideRef.current) {
        dropGuideRef.current.style.stroke = pulseColor
        dropGuideRef.current.style.opacity = String(
          playing ? 0.1 + (bounceHeight / Math.max(1, peak)) * 0.28 : 0.06,
        )
      }

      frameId = requestAnimationFrame(draw)
    }

    frameId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frameId)
  }, [beatDurationMs, playing, reducedMotion, tone])

  return (
    <div className={`metronome-ribbon metronome-pulse-tone--${tone}`}>
      <span className="metronome-ribbon__halo" />
      <svg viewBox="0 0 360 230" focusable="false">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f5a300" />
            <stop offset="46%" stopColor="#79a8aa" />
            <stop offset="62%" stopColor="#1598ff" />
            <stop offset="100%" stopColor="#1598ff" />
          </linearGradient>
          <radialGradient id={pulseGradientId}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="35%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" ref={glowStopRef} stopColor="#1598ff" stopOpacity="0" />
          </radialGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <g className="metronome-ribbon__ghosts">
          {Array.from({ length: 5 }, (_, index) => (
            <path
              key={index}
              ref={(node) => {
                ghostPathRefs.current[index] = node
              }}
              stroke={`url(#${gradientId})`}
            />
          ))}
        </g>
        <line ref={dropGuideRef} className="metronome-ribbon__drop-guide" x1="180" y1="38" x2="180" y2="112" />
        <path ref={mainPathRef} className="metronome-ribbon__main" stroke={`url(#${gradientId})`} />
        <circle ref={strikeRingRef} className="metronome-ribbon__strike-ring" cx="180" cy="112" r="8" />
        <circle ref={strikeDotRef} className="metronome-ribbon__strike-dot" cx="180" cy="112" r="3" />
        <g ref={travelGroupRef} className="metronome-ribbon__travel" transform="translate(180 112)">
          <circle
            ref={travelGlowRef}
            className="metronome-ribbon__travel-glow"
            cx="0"
            cy="0"
            r="20"
            fill={`url(#${pulseGradientId})`}
            filter={`url(#${glowId})`}
          />
          <circle ref={travelCoreRef} className="metronome-ribbon__travel-core" cx="0" cy="0" r="5.2" />
        </g>
      </svg>
    </div>
  )
}

function BeatMarkers({
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
