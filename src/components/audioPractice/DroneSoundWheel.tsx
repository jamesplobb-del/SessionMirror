import { ChevronDown, Minus, Plus, Power } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  memo,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type WheelEvent,
} from 'react'
import { DRONE_NOTE_STRIP } from '../../utils/droneEngine'
import { triggerLightHaptic } from '../../utils/haptics'
import {
  DEFAULT_TUNER_TRANSPOSITION,
  getTunerTransposition,
  getWrittenPitchLabel,
  type TunerTranspositionId,
} from '../../utils/tunerTransposition'

const NOTE_COUNT = 12
/** Width of one compact ribbon note, mirrored in the widget's CSS. */
const COMPACT_NOTE_WIDTH = 40
const MIN_OCTAVE = 0
const MAX_OCTAVE = 8
const SCROLL_IDLE_MS = 140
const CHORD_INTERVALS = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
} as const

type ChordQuality = keyof typeof CHORD_INTERVALS

export interface DroneSoundWheelProps {
  activeNotes: number[]
  octave: number
  onToggleNote: (pitchClass: number) => void
  onGlissNote: (pitchClass: number, octave: number) => void
  onSetNotes: (pitchClasses: number[]) => void
  onIncrementOctave: () => void
  onDecrementOctave: () => void
  onDroneInteraction?: () => void
  onClose?: () => void
  hapticsEnabled?: boolean
  /** Changes written labels only; all callbacks continue to receive concert pitch. */
  tunerTransposition?: TunerTranspositionId
  /**
   * Ribbon only — no card chrome, power button or chord modes. The floating
   * drone widget supplies its own transport, and reuses this so the scroll,
   * the centre mark and the gliss behave exactly as they do in the Tuner tab.
   */
  compact?: boolean
}

interface RibbonPitch {
  absolute: number
  octave: number
  pitchClass: number
}

function triadFor(root: number, quality: ChordQuality): number[] {
  return CHORD_INTERVALS[quality]
    .map((interval) => (root + interval) % NOTE_COUNT)
    .sort((left, right) => left - right)
}

function sameNotes(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort((a, b) => a - b)
  const sortedRight = [...right].sort((a, b) => a - b)
  return sortedLeft.every((note, index) => note === sortedRight[index])
}

function buildRibbonPitches(): RibbonPitch[] {
  const notes: RibbonPitch[] = []
  for (let octave = MIN_OCTAVE; octave <= MAX_OCTAVE; octave += 1) {
    for (const note of DRONE_NOTE_STRIP) {
      notes.push({
        absolute: octave * NOTE_COUNT + note.pitchClass,
        octave,
        pitchClass: note.pitchClass,
      })
    }
  }
  return notes
}

const RIBBON_PITCHES = buildRibbonPitches()

function DroneSoundWheel({
  activeNotes,
  octave,
  onToggleNote,
  onGlissNote,
  onSetNotes,
  onIncrementOctave,
  onDecrementOctave,
  onDroneInteraction,
  onClose,
  hapticsEnabled = true,
  tunerTransposition = DEFAULT_TUNER_TRANSPOSITION,
  compact = false,
}: DroneSoundWheelProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const scrollIdleTimerRef = useRef<number | null>(null)
  const userScrollingRef = useRef(false)
  const lastGlissAbsoluteRef = useRef<number | null>(null)
  const [rootPitchClass, setRootPitchClass] = useState<number | null>(
    activeNotes[0] ?? null,
  )
  const [glissAbsolute, setGlissAbsolute] = useState<number | null>(null)
  /*
   * The full-width ribbon centres its notes with a 50vw rail padding. Inside
   * the floating widget the viewport is a couple of hundred pixels wide, so
   * the padding has to come from the viewport itself or the centre mark lands
   * nowhere near the selected note.
   */
  const [railPad, setRailPad] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!compact) return
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      const width = viewport.clientWidth
      if (width > 0) setRailPad(Math.max(0, width / 2 - COMPACT_NOTE_WIDTH / 2))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [compact])

  const root = rootPitchClass ?? activeNotes[0] ?? 0
  const enabled = activeNotes.length > 0
  const majorActive = enabled && sameNotes(activeNotes, triadFor(root, 'major'))
  const minorActive = enabled && sameNotes(activeNotes, triadFor(root, 'minor'))
  const transposition = getTunerTransposition(tunerTransposition)
  const writtenRoot = getWrittenPitchLabel(root, octave, tunerTransposition)
  const concertRoot = getWrittenPitchLabel(
    root,
    octave,
    DEFAULT_TUNER_TRANSPOSITION,
  )
  const lowerWrittenRoot = getWrittenPitchLabel(
    root,
    Math.max(MIN_OCTAVE, octave - 1),
    tunerTransposition,
  )
  const higherWrittenRoot = getWrittenPitchLabel(
    root,
    Math.min(MAX_OCTAVE, octave + 1),
    tunerTransposition,
  )

  useEffect(() => {
    if (activeNotes.length === 0) return
    if (rootPitchClass === null || !activeNotes.includes(rootPitchClass)) {
      setRootPitchClass(activeNotes[0] ?? null)
    }
  }, [activeNotes, rootPitchClass])

  useEffect(() => {
    if (userScrollingRef.current) return
    const viewport = viewportRef.current
    const target = viewport?.querySelector<HTMLElement>(
      `[data-ribbon-absolute="${octave * NOTE_COUNT + root}"]`,
    )
    if (!viewport || !target) return
    const nextLeft = target.offsetLeft - (viewport.clientWidth - target.offsetWidth) / 2
    // The first pass runs before the rail is padded, which would leave the
    // ribbon parked off-centre; jump without animation until it is measured.
    viewport.scrollTo({ left: nextLeft, behavior: railPad === null ? 'auto' : 'smooth' })
  }, [octave, railPad, root])

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current)
      if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current)
    },
    [],
  )

  const nearestPitchToCenter = () => {
    const viewport = viewportRef.current
    if (!viewport) return null
    const center = viewport.scrollLeft + viewport.clientWidth / 2
    let nearest: { pitch: RibbonPitch; distance: number } | null = null

    for (const element of viewport.querySelectorAll<HTMLElement>('[data-ribbon-absolute]')) {
      const absolute = Number.parseInt(element.dataset.ribbonAbsolute ?? '', 10)
      const pitch = RIBBON_PITCHES[absolute]
      if (!pitch) continue
      const distance = Math.abs(element.offsetLeft + element.offsetWidth / 2 - center)
      if (!nearest || distance < nearest.distance) nearest = { pitch, distance }
    }
    return nearest?.pitch ?? null
  }

  const finishScrollingSoon = () => {
    if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current)
    scrollIdleTimerRef.current = window.setTimeout(() => {
      userScrollingRef.current = false
      scrollIdleTimerRef.current = null
      const pitch = nearestPitchToCenter()
      if (pitch) setRootPitchClass(pitch.pitchClass)
      setGlissAbsolute(null)
    }, SCROLL_IDLE_MS)
  }

  const handleScroll = () => {
    if (!userScrollingRef.current || scrollFrameRef.current !== null) return
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null
      const pitch = nearestPitchToCenter()
      if (!pitch || pitch.absolute === lastGlissAbsoluteRef.current) {
        finishScrollingSoon()
        return
      }

      lastGlissAbsoluteRef.current = pitch.absolute
      setGlissAbsolute(pitch.absolute)
      setRootPitchClass(pitch.pitchClass)
      onDroneInteraction?.()
      triggerLightHaptic(hapticsEnabled)
      onGlissNote(pitch.pitchClass, pitch.octave)
      finishScrollingSoon()
    })
  }

  const beginScrolling = () => {
    userScrollingRef.current = true
    lastGlissAbsoluteRef.current = null
    onDroneInteraction?.()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    beginScrolling()
  }

  const handlePointerEnd = () => {
    finishScrollingSoon()
  }

  const handleWheel = (_event: WheelEvent<HTMLDivElement>) => {
    beginScrolling()
    finishScrollingSoon()
  }

  const handleNoteClick = (pitch: RibbonPitch) => {
    userScrollingRef.current = false
    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current)
      scrollIdleTimerRef.current = null
    }
    setGlissAbsolute(null)
    onDroneInteraction?.()
    setRootPitchClass(pitch.pitchClass)
    if (pitch.octave !== octave) {
      triggerLightHaptic(hapticsEnabled)
      onGlissNote(pitch.pitchClass, pitch.octave)
      return
    }
    onToggleNote(pitch.pitchClass)
  }

  const applyMode = (mode: ChordQuality) => {
    onDroneInteraction?.()
    setRootPitchClass(root)
    onSetNotes(triadFor(root, mode))
  }

  const toggleDrone = () => {
    onDroneInteraction?.()
    onSetNotes(enabled ? [] : [root])
  }

  const activeMode = useMemo<ChordQuality | null>(() => {
    if (majorActive) return 'major'
    if (minorActive) return 'minor'
    return null
  }, [majorActive, minorActive])

  const ribbon = (
    <div className="harmonic-ribbon__viewport-shell">
        <span className="harmonic-ribbon__center-mark" aria-hidden />
        <div
          ref={viewportRef}
          className="harmonic-ribbon__viewport"
          role="group"
          aria-label={`Swipe or tap to choose a drone pitch. Written pitch for ${transposition.label}`}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          <div
            className="harmonic-ribbon__rail"
            style={
              railPad === null
                ? undefined
                : ({ '--ribbon-rail-pad': `${railPad}px` } as CSSProperties)
            }
          >
            {RIBBON_PITCHES.map((pitch) => {
              const active = activeNotes.includes(pitch.pitchClass) && pitch.octave === octave
              const isRoot = pitch.pitchClass === root && pitch.octave === octave
              const glissing = pitch.absolute === glissAbsolute
              const writtenPitch = getWrittenPitchLabel(
                pitch.pitchClass,
                pitch.octave,
                tunerTransposition,
              )
              const soundingPitch = getWrittenPitchLabel(
                pitch.pitchClass,
                pitch.octave,
                DEFAULT_TUNER_TRANSPOSITION,
              )
              return (
                <button
                  key={pitch.absolute}
                  type="button"
                  data-ribbon-absolute={pitch.absolute}
                  className={`harmonic-ribbon__note ${active ? 'harmonic-ribbon__note--active' : ''} ${
                    isRoot ? 'harmonic-ribbon__note--root' : ''
                  } ${glissing ? 'harmonic-ribbon__note--gliss' : ''} ${
                    writtenPitch.label.length > 1 ? 'harmonic-ribbon__note--accidental' : ''
                  }`}
                  aria-label={`Written ${writtenPitch.noteName}; sounds concert ${soundingPitch.noteName}${active ? '; active drone note' : ''}`}
                  aria-pressed={active}
                  onClick={() => handleNoteClick(pitch)}
                >
                  <span>{writtenPitch.label}</span>
                  <small>{writtenPitch.octave}</small>
                </button>
              )
            })}
          </div>
        </div>
    </div>
  )

  if (compact) {
    return (
      <section
        className="harmonic-ribbon harmonic-ribbon--compact pointer-events-auto"
        aria-label={`Drone pitch. Shown as written for ${transposition.label}`}
      >
        {ribbon}
      </section>
    )
  }

  return (
    <section
      className="harmonic-ribbon pointer-events-auto"
      aria-label={`Drone controls. Pitches shown as written for ${transposition.label}`}
    >
      {ribbon}

      <div className="harmonic-ribbon__controls">
        <button
          type="button"
          className={`harmonic-ribbon__power ${enabled ? 'harmonic-ribbon__power--active' : ''}`}
          aria-label={
            enabled
              ? `Turn off drone. Written root ${writtenRoot.noteName}, sounding concert ${concertRoot.noteName}`
              : `Turn on ${writtenRoot.noteName} drone. Sounds concert ${concertRoot.noteName}`
          }
          aria-pressed={enabled}
          onClick={toggleDrone}
        >
          <Power aria-hidden />
        </button>

        <div
          className="harmonic-ribbon__mode"
          role="group"
          aria-label={`Drone chord mode. Written root ${writtenRoot.noteName}`}
        >
          {(['major', 'minor'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={activeMode === mode ? 'harmonic-ribbon__mode--active' : ''}
              aria-pressed={activeMode === mode}
              aria-label={`${writtenRoot.noteName} ${mode} drone chord. Root sounds concert ${concertRoot.noteName}`}
              onClick={() => applyMode(mode)}
            >
              {writtenRoot.label} {mode === 'major' ? 'Maj' : 'Min'}
            </button>
          ))}
        </div>

        <div
          className="harmonic-ribbon__octave"
          aria-label={`Written drone root ${writtenRoot.noteName}; sounding concert ${concertRoot.noteName}`}
        >
          <button
            type="button"
            aria-label={`Lower drone one octave to written ${lowerWrittenRoot.noteName}`}
            disabled={octave <= MIN_OCTAVE}
            onClick={onDecrementOctave}
          >
            <Minus aria-hidden />
          </button>
          <span>
            <small>{writtenRoot.label}</small>
            <strong>{writtenRoot.octave}</strong>
          </span>
          <button
            type="button"
            aria-label={`Raise drone one octave to written ${higherWrittenRoot.noteName}`}
            disabled={octave >= MAX_OCTAVE}
            onClick={onIncrementOctave}
          >
            <Plus aria-hidden />
          </button>
        </div>

        {onClose ? (
          <button
            type="button"
            data-tutorial="tuner-drone-close"
            className="harmonic-ribbon__close"
            aria-label="Hide drone"
            title="Hide drone"
            onClick={onClose}
          >
            <ChevronDown aria-hidden />
          </button>
        ) : null}
      </div>
    </section>
  )
}

export default memo(DroneSoundWheel)
