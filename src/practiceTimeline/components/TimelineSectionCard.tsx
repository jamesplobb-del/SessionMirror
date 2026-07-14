import { Copy, GripVertical, Trash2 } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import Pressable from '../../components/ui/Pressable'
import { triggerLightHaptic, triggerWarningHaptic } from '../../utils/haptics'
import { patternSectionSummary, sectionHasMeterPattern } from '../patternLogic'
import {
  effectiveBars,
  sectionBarWidth,
  subdivisionLabel,
  tempoRampLabel,
} from '../timeSignatureLogic'
import { repeatLabel } from '../sectionDefaults'
import type { TimelineSection } from '../types'

interface TimelineSectionCardProps {
  section: TimelineSection
  maxBars: number
  index: number
  onPress: () => void
  onPlayFrom: () => void
  onDuplicate: () => void
  onDelete: () => void
  onDragStart: (index: number) => void
  onDragOver: (index: number) => void
  onDragEnd: () => void
  isDragging: boolean
}

const DELETE_REVEAL_WIDTH = 88
const SWIPE_ACTIVATE_DISTANCE = 12
const SWIPE_REVEAL_THRESHOLD = 38

export default function TimelineSectionCard({
  section,
  maxBars,
  index,
  onPress,
  onPlayFrom,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
}: TimelineSectionCardProps) {
  const [showActions, setShowActions] = useState(false)
  const [deleteRevealed, setDeleteRevealed] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const swipeStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const swipeOffsetRef = useRef(0)
  const swipeConsumedRef = useRef(false)
  const barWidth = sectionBarWidth(section, maxBars)
  const ramp = tempoRampLabel(section)
  const isPattern = sectionHasMeterPattern(section)
  const patternSummary = isPattern ? patternSectionSummary(section) : null

  const closeDelete = () => {
    setDeleteRevealed(false)
    setSwipeOffset(0)
    swipeOffsetRef.current = 0
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    swipeStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
    swipeConsumedRef.current = false
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return

    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!swiping && Math.abs(dx) < SWIPE_ACTIVATE_DISTANCE) return
    if (!swiping && Math.abs(dy) > Math.abs(dx)) return

    const offset = Math.max(0, Math.min(DELETE_REVEAL_WIDTH, deleteRevealed ? DELETE_REVEAL_WIDTH - dx : -dx))
    if (offset <= 0 && !deleteRevealed) return

    event.preventDefault()
    setSwiping(true)
    setSwipeOffset(offset)
    swipeOffsetRef.current = offset
    swipeConsumedRef.current = true
  }

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current
    if (!start || start.pointerId !== event.pointerId) return

    const nextRevealed = swipeOffsetRef.current > SWIPE_REVEAL_THRESHOLD
    setDeleteRevealed(nextRevealed)
    setSwipeOffset(0)
    swipeOffsetRef.current = 0
    setSwiping(false)
    swipeStartRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (nextRevealed && !deleteRevealed) triggerLightHaptic()
  }

  const cardTranslate = swiping ? -swipeOffset : deleteRevealed ? -DELETE_REVEAL_WIDTH : 0

  return (
    <div
      className="practice-timeline__section-swipe"
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver(index)
      }}
    >
      <button
        type="button"
        className="practice-timeline__section-delete"
        onClick={(event) => {
          event.stopPropagation()
          triggerWarningHaptic()
          onDelete()
        }}
      >
        <Trash2 size={18} aria-hidden />
        Delete
      </button>
      <div
        className={`practice-timeline__section-card ${isDragging ? 'practice-timeline__section-card--dragging' : ''} ${swiping ? 'practice-timeline__section-card--swiping' : ''}`}
        style={{ transform: `translateX(${cardTranslate}px)` }}
        draggable={!deleteRevealed}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDragStart={() => onDragStart(index)}
        onDragEnd={onDragEnd}
        onClick={() => {
          if (swipeConsumedRef.current) {
            swipeConsumedRef.current = false
            return
          }
          if (deleteRevealed) {
            closeDelete()
            return
          }
          onPress()
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onPress()
        }}
      >
        <div className="flex items-start gap-2">
          <div className="mt-1 shrink-0 opacity-40" aria-hidden>
            <GripVertical size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="practice-timeline__section-title">{section.title}</h3>
            <div className="practice-timeline__section-bar" aria-hidden>
              <div
                className="practice-timeline__section-bar-fill"
                style={{ width: `${barWidth * 100}%` }}
              />
            </div>
            <div className="practice-timeline__section-meta">
              <span>
                <strong>{effectiveBars(section)}</strong> bars
              </span>
              {isPattern ? (
                <span className="practice-timeline__section-meta-pattern">
                  <strong>{patternSummary}</strong>
                </span>
              ) : (
                <>
                  <span>
                    <strong>{section.meter}</strong>
                  </span>
                  <span>
                    <strong>{section.bpm}</strong> BPM
                  </span>
                  <span>
                    Clicks <strong>{subdivisionLabel(section)}</strong>
                  </span>
                </>
              )}
              <span>
                Repeat <strong>{repeatLabel(section.repeatCount)}</strong>
              </span>
              {ramp ? (
                <span>
                  <strong>{ramp}</strong>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {showActions ? (
          <div className="practice-timeline__section-actions" onClick={(e) => e.stopPropagation()}>
            <Pressable
              type="button"
              intensity="soft"
              className="practice-timeline__section-action practice-timeline__section-action--play"
              onClick={onPlayFrom}
            >
              Play from here
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className="practice-timeline__section-action"
              onClick={onDuplicate}
            >
              <Copy size={14} className="mr-1 inline" />
              Duplicate
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              haptic="warning"
              className="practice-timeline__section-action practice-timeline__section-action--danger"
              onClick={onDelete}
            >
              <Trash2 size={14} className="mr-1 inline" />
              Delete
            </Pressable>
          </div>
        ) : (
          <Pressable
            type="button"
            intensity="soft"
            squish={false}
            className="mt-2 w-full text-center text-xs font-semibold text-[var(--audio-text-secondary)]"
            onClick={(event) => {
              event.stopPropagation()
              setShowActions(true)
            }}
          >
            Actions
          </Pressable>
        )}
      </div>
    </div>
  )
}
