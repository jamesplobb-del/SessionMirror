import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus } from 'lucide-react'
import { DRONE_NOTE_STRIP } from '../../utils/droneEngine'

const WHEEL_NOTE_COUNT = 12
const DIAL_SIZE = 200
const DIAL_CENTER = DIAL_SIZE / 2
const DIAL_OUTER_RADIUS = 94
const DIAL_LABEL_RADIUS = 81
const GLISSANDO_THRESHOLD_PX = 10
const INNER_HIT_RADIUS_RATIO = 0.61
const OUTER_HIT_RADIUS_RATIO = 1.02
const INNER_NOTE_RADIUS = 67
const SEGMENT_PAD_ANGLE = (Math.PI * 2) / WHEEL_NOTE_COUNT
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
  children: ReactNode
}

function shortNoteLabel(label: string): string {
  return label.split('/')[0] ?? label
}

function noteAngle(index: number): number {
  return (index / WHEEL_NOTE_COUNT) * Math.PI * 2 - Math.PI / 2
}

function polarPoint(radius: number, angle: number): { x: number; y: number } {
  return {
    x: DIAL_CENTER + radius * Math.cos(angle),
    y: DIAL_CENTER + radius * Math.sin(angle),
  }
}

function segmentPath(index: number, emphasized: boolean): string {
  const gap = 0.045
  const halfStep = (SEGMENT_PAD_ANGLE - gap) / 2
  const mid = noteAngle(index)
  const start = mid - halfStep
  const end = mid + halfStep
  const innerRadius = emphasized ? INNER_NOTE_RADIUS - 4 : INNER_NOTE_RADIUS
  const outerRadius = emphasized ? DIAL_OUTER_RADIUS + 4 : DIAL_OUTER_RADIUS
  const outerStart = polarPoint(outerRadius, start)
  const outerEnd = polarPoint(outerRadius, end)
  const innerEnd = polarPoint(innerRadius, end)
  const innerStart = polarPoint(innerRadius, start)

  return [
    `M ${outerStart.x.toFixed(2)} ${outerStart.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x.toFixed(2)} ${outerEnd.y.toFixed(2)}`,
    `L ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function wheelPoint(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): { pitchClass: number; angle: number } | null {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = clientX - cx
  const dy = clientY - cy
  const dist = Math.hypot(dx, dy)
  const radius = rect.width / 2
  const minR = radius * INNER_HIT_RADIUS_RATIO
  const maxR = radius * OUTER_HIT_RADIUS_RATIO
  if (dist < minR || dist > maxR) return null

  let angle = Math.atan2(dy, dx) + Math.PI / 2
  if (angle < 0) angle += Math.PI * 2
  const index = Math.round((angle / (Math.PI * 2)) * WHEEL_NOTE_COUNT) % WHEEL_NOTE_COUNT
  const pitchClass = DRONE_NOTE_STRIP[index]?.pitchClass
  return pitchClass === undefined ? null : { pitchClass, angle }
}

function triadFor(root: number, quality: ChordQuality): number[] {
  return CHORD_INTERVALS[quality]
    .map((interval) => (root + interval) % WHEEL_NOTE_COUNT)
    .sort((a, b) => a - b)
}

function sameNotes(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false
  const sortedLeft = [...left].sort((a, b) => a - b)
  return sortedLeft.every((note, index) => note === right[index])
}

export default function DroneSoundWheel({
  activeNotes,
  octave,
  onToggleNote,
  onGlissNote,
  onSetNotes,
  onIncrementOctave,
  onDecrementOctave,
  onDroneInteraction,
  children,
}: DroneSoundWheelProps) {
  const ringRef = useRef<HTMLDivElement>(null)
  const [glissandoPitch, setGlissandoPitch] = useState<number | null>(null)
  const [rootPitchClass, setRootPitchClass] = useState<number | null>(null)
  const sessionRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    isGlissando: false,
    downPitchClass: null as number | null,
    lastPitchClass: null as number | null,
    lastAngle: null as number | null,
    currentOctave: octave,
    lastSoloKey: null as number | null,
  })

  useEffect(() => {
    if (activeNotes.length === 0) {
      setRootPitchClass(null)
      return
    }
    if (rootPitchClass === null || !activeNotes.includes(rootPitchClass)) {
      setRootPitchClass(activeNotes[0] ?? null)
    }
  }, [activeNotes, rootPitchClass])

  const readWheelPoint = (clientX: number, clientY: number) => {
    const rect = ringRef.current?.getBoundingClientRect()
    if (!rect) return null
    return wheelPoint(rect, clientX, clientY)
  }

  const resetSession = () => {
    sessionRef.current = {
      pointerId: -1,
      startX: 0,
      startY: 0,
      isGlissando: false,
      downPitchClass: null,
      lastPitchClass: null,
      lastAngle: null,
      currentOctave: octave,
      lastSoloKey: null,
    }
    setGlissandoPitch(null)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const point = readWheelPoint(event.clientX, event.clientY)
    if (!point) return

    event.preventDefault()
    onDroneInteraction?.()
    sessionRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      isGlissando: false,
      downPitchClass: point.pitchClass,
      lastPitchClass: point.pitchClass,
      lastAngle: point.angle,
      currentOctave: octave,
      lastSoloKey: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return

    const session = sessionRef.current
    const point = readWheelPoint(event.clientX, event.clientY)
    const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)

    if (
      !session.isGlissando &&
      (distance >= GLISSANDO_THRESHOLD_PX ||
        (point !== null &&
          session.downPitchClass !== null &&
          point.pitchClass !== session.downPitchClass &&
          distance > 4))
    ) {
      session.isGlissando = true
    }

    if (!session.isGlissando || !point) return

    event.preventDefault()
    onDroneInteraction?.()
    setGlissandoPitch(point.pitchClass)

    if (session.lastAngle !== null && session.lastPitchClass !== null) {
      let angleDelta = point.angle - session.lastAngle
      if (angleDelta > Math.PI) angleDelta -= Math.PI * 2
      if (angleDelta < -Math.PI) angleDelta += Math.PI * 2

      if (
        angleDelta > 0 &&
        point.pitchClass < session.lastPitchClass &&
        session.lastPitchClass - point.pitchClass > WHEEL_NOTE_COUNT / 2
      ) {
        session.currentOctave = Math.min(8, session.currentOctave + 1)
      } else if (
        angleDelta < 0 &&
        point.pitchClass > session.lastPitchClass &&
        point.pitchClass - session.lastPitchClass > WHEEL_NOTE_COUNT / 2
      ) {
        session.currentOctave = Math.max(0, session.currentOctave - 1)
      }
    }

    session.lastAngle = point.angle
    session.lastPitchClass = point.pitchClass
    const soloKey = session.currentOctave * WHEEL_NOTE_COUNT + point.pitchClass
    if (session.lastSoloKey === soloKey) return
    session.lastSoloKey = soloKey
    onGlissNote(point.pitchClass, session.currentOctave)
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (!session.isGlissando && session.downPitchClass !== null) {
      const point = readWheelPoint(event.clientX, event.clientY)
      if (point?.pitchClass === session.downPitchClass) {
        onDroneInteraction?.()
        const becomingActive = !activeNotes.includes(session.downPitchClass)
        if (becomingActive && activeNotes.length === 0) {
          setRootPitchClass(session.downPitchClass)
        } else if (!becomingActive && rootPitchClass === session.downPitchClass) {
          setRootPitchClass(
            activeNotes.find((note) => note !== session.downPitchClass) ?? null,
          )
        }
        onToggleNote(session.downPitchClass)
      }
    }

    resetSession()
  }

  const applyChord = (quality: ChordQuality) => {
    const root = rootPitchClass ?? activeNotes[0]
    if (root === undefined || root === null) return
    onDroneInteraction?.()
    setRootPitchClass(root)
    onSetNotes(triadFor(root, quality))
  }

  const rootLabel =
    rootPitchClass === null
      ? 'Root'
      : shortNoteLabel(DRONE_NOTE_STRIP[rootPitchClass]?.label ?? 'Root')
  const majorActive =
    rootPitchClass !== null && sameNotes(activeNotes, triadFor(rootPitchClass, 'major'))
  const minorActive =
    rootPitchClass !== null && sameNotes(activeNotes, triadFor(rootPitchClass, 'minor'))

  return (
    <div className="drone-sound-wheel pointer-events-auto">
      <div className="drone-sound-wheel__stage">
        <svg
          className="drone-sound-wheel__dial"
          viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
          aria-hidden
        >
          <circle className="drone-sound-wheel__track drone-sound-wheel__track--outer" cx="100" cy="100" r="89" />
          <circle className="drone-sound-wheel__track drone-sound-wheel__track--inner" cx="100" cy="100" r="67" />

          {DRONE_NOTE_STRIP.map(({ pitchClass }, index) => {
            const active = activeNotes.includes(pitchClass)
            const glissando = glissandoPitch === pitchClass
            const root = active && rootPitchClass === pitchClass
            return (
              <path
                key={`segment-${pitchClass}`}
                d={segmentPath(index, active || glissando)}
                className={`drone-sound-wheel__segment ${
                  active ? 'drone-sound-wheel__segment--active' : ''
                } ${root ? 'drone-sound-wheel__segment--root' : ''} ${
                  glissando ? 'drone-sound-wheel__segment--glissando' : ''
                }`}
              />
            )
          })}
        </svg>

        <div className="drone-sound-wheel__center">{children}</div>

        <div
          ref={ringRef}
          className="drone-sound-wheel__ring"
          role="group"
          aria-label="Drone notes"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          {DRONE_NOTE_STRIP.map(({ pitchClass, label }, index) => {
            const active = activeNotes.includes(pitchClass)
            const glissando = glissandoPitch === pitchClass
            const root = active && rootPitchClass === pitchClass
            const angle = noteAngle(index)
            const labelPoint = polarPoint(DIAL_LABEL_RADIUS, angle)
            const leftPercent = (labelPoint.x / DIAL_SIZE) * 100
            const topPercent = (labelPoint.y / DIAL_SIZE) * 100
            return (
              <span
                key={pitchClass}
                data-drone-note
                data-pitch-class={pitchClass}
                className={`drone-sound-wheel__note ${
                  active ? 'drone-sound-wheel__note--active' : ''
                } ${root ? 'drone-sound-wheel__note--root' : ''} ${
                  glissando ? 'drone-sound-wheel__note--glissando' : ''
                }`}
                style={{
                  left: `${leftPercent}%`,
                  top: `${topPercent}%`,
                }}
                aria-hidden
              >
                {shortNoteLabel(label)}
              </span>
            )
          })}
        </div>
      </div>

      <div className="drone-sound-wheel__controls">
        <div className="drone-sound-wheel__quality" aria-label="Build chord from selected root">
          <span className="drone-sound-wheel__root">{rootLabel}</span>
          <button
            type="button"
            className={`drone-sound-wheel__quality-btn ${
              majorActive ? 'drone-sound-wheel__quality-btn--active' : ''
            }`}
            disabled={rootPitchClass === null}
            aria-pressed={majorActive}
            onClick={() => applyChord('major')}
          >
            Maj
          </button>
          <button
            type="button"
            className={`drone-sound-wheel__quality-btn ${
              minorActive ? 'drone-sound-wheel__quality-btn--active' : ''
            }`}
            disabled={rootPitchClass === null}
            aria-pressed={minorActive}
            onClick={() => applyChord('minor')}
          >
            Min
          </button>
        </div>

        <div className="drone-sound-wheel__octave" aria-label="Drone octave">
          <button
            type="button"
            className="drone-sound-wheel__octave-btn"
            aria-label="Lower octave"
            disabled={octave <= 0}
            onClick={onDecrementOctave}
          >
            <Minus aria-hidden />
          </button>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={octave}
              className="drone-sound-wheel__octave-value"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
            >
              <span className="drone-sound-wheel__octave-label">Oct</span> {octave}
            </motion.span>
          </AnimatePresence>
          <button
            type="button"
            className="drone-sound-wheel__octave-btn"
            aria-label="Raise octave"
            disabled={octave >= 8}
            onClick={onIncrementOctave}
          >
            <Plus aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
