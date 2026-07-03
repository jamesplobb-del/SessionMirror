import { Copy, GripVertical, Trash2 } from 'lucide-react'
import { useState } from 'react'
import Pressable from '../../components/ui/Pressable'
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
  const barWidth = sectionBarWidth(section, maxBars)
  const ramp = tempoRampLabel(section)

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver(index)
      }}
    >
      <div
        className={`practice-timeline__section-card ${isDragging ? 'practice-timeline__section-card--dragging' : ''}`}
        draggable
        onDragStart={() => onDragStart(index)}
        onDragEnd={onDragEnd}
        onClick={onPress}
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
              <span>
                <strong>{section.meter}</strong>
              </span>
              <span>
                <strong>{section.bpm}</strong> BPM
              </span>
              <span>
                Sub: <strong>{subdivisionLabel(section)}</strong>
              </span>
              <span>
                Repeat: <strong>{repeatLabel(section.repeatCount)}</strong>
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
