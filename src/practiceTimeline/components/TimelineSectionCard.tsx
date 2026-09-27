import { Copy, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import Pressable from '../../components/ui/Pressable'
import { triggerLightHaptic, triggerWarningHaptic } from '../../utils/haptics'
import { formatPatternMetersLabel, sectionHasMeterPattern } from '../patternLogic'
import { effectiveBars, subdivisionLabel, tempoRampLabel } from '../timeSignatureLogic'
import { repeatLabel } from '../sectionDefaults'
import type { TimelineSection } from '../types'

interface TimelineSectionCardProps {
  section: TimelineSection
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
  const [showMoreActions, setShowMoreActions] = useState(false)
  const [deleteRevealed, setDeleteRevealed] = useState(false)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [swiping, setSwiping] = useState(false)
  const swipeStartRef = useRef<{
    x: number
    y: number
    pointerId: number
  } | null>(null)
  const swipeOffsetRef = useRef(0)
  const swipeConsumedRef = useRef(false)
  const ramp = tempoRampLabel(section)
  const isPattern = sectionHasMeterPattern(section)
  const patternSummary = isPattern ? formatPatternMetersLabel(section.patternSteps ?? []) : null
  const details = isPattern
    ? `${effectiveBars(section)} bars · ${patternSummary}`
    : `${section.bars} bars · ${section.meter}${section.repeatCount > 1 ? ` · ${repeatLabel(section.repeatCount)}` : ''}`
  const clickDetail = section.subdivision !== 'auto' ? subdivisionLabel(section) : null

  const closeDelete = () => {
    setDeleteRevealed(false)
    setSwipeOffset(0)
    swipeOffsetRef.current = 0
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
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

    const offset = Math.max(
      0,
      Math.min(DELETE_REVEAL_WIDTH, deleteRevealed ? DELETE_REVEAL_WIDTH - dx : -dx)
    )
    if (offset <= 0 && !deleteRevealed) return

    // Keep ordinary taps on their buttons; capture only an actual swipe.
    if (!swipeConsumedRef.current) event.currentTarget.setPointerCapture?.(event.pointerId)
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
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
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
      {swiping || deleteRevealed ? (
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
      ) : null}
      <div
        className={`practice-timeline__section-card ${
          isDragging ? 'practice-timeline__section-card--dragging' : ''
        } ${swiping ? 'practice-timeline__section-card--swiping' : ''}`}
        style={cardTranslate ? { transform: `translateX(${cardTranslate}px)` } : undefined}
        draggable={!deleteRevealed}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDragStart={() => onDragStart(index)}
        onDragEnd={onDragEnd}
        onClickCapture={(event) => {
          if (!swipeConsumedRef.current) return
          swipeConsumedRef.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={() => {
          if (deleteRevealed) closeDelete()
        }}
      >
        <div className="practice-timeline__section-header">
          <span className="practice-timeline__section-number" aria-hidden>{index + 1}</span>
          <Pressable
            type="button"
            intensity="soft"
            className="practice-timeline__section-title-button"
            aria-label={`Edit section ${index + 1}: ${section.title}`}
            onClick={(event) => {
              event.stopPropagation()
              onPress()
            }}
          >
            <span className="practice-timeline__section-copy">
              <strong className="practice-timeline__section-title">{section.title}</strong>
              <small className="practice-timeline__section-compact-meta">{details}</small>
              {(ramp || clickDetail) && <small className="practice-timeline__section-compact-detail">{[ramp, clickDetail].filter(Boolean).join(' · ')}</small>}
            </span>
            {!isPattern && <span className="practice-timeline__section-tempo">{section.bpm}<small> BPM</small></span>}
          </Pressable>
          <Pressable
            type="button"
            intensity="icon"
            className="practice-timeline__section-more"
            aria-label={`More actions for ${section.title}`}
            aria-expanded={showMoreActions}
            onClick={(event) => {
              event.stopPropagation()
              setShowMoreActions((visible) => !visible)
            }}
          >
            <MoreHorizontal size={20} aria-hidden />
          </Pressable>
        </div>

        {showMoreActions ? (
          <div
            className="practice-timeline__section-actions"
            onClick={(event) => event.stopPropagation()}
          >
            <Pressable
              type="button"
              intensity="soft"
              className="practice-timeline__section-action practice-timeline__section-action--play"
              onClick={() => { onPlayFrom(); setShowMoreActions(false) }}
            >
              <Play size={14} fill="currentColor" aria-hidden />
              Start here
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              className="practice-timeline__section-action"
              onClick={() => {
                onDuplicate()
                setShowMoreActions(false)
              }}
            >
              <Copy size={14} aria-hidden />
              Duplicate
            </Pressable>
            <Pressable
              type="button"
              intensity="soft"
              haptic="warning"
              className="practice-timeline__section-action practice-timeline__section-action--danger"
              onClick={onDelete}
            >
              <Trash2 size={14} aria-hidden />
              Delete
            </Pressable>
          </div>
        ) : null}
      </div>
    </div>
  )
}
