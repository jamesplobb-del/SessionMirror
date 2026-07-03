import { Copy, Star, Upload } from 'lucide-react'
import { useRef } from 'react'
import AnimatedBottomSheet from '../../components/ui/AnimatedBottomSheet'
import Pressable from '../../components/ui/Pressable'
import {
  duplicateTimeline,
  importTimeline,
  loadTimelines,
  saveTimeline,
  shareTimelineExport,
  toggleTimelineFavorite,
} from '../storage/timelineStorage'
import { STARTER_TEMPLATES } from '../templates/starterTemplates'
import type { PracticeTimeline } from '../types'

interface TimelineLibrarySheetProps {
  open: boolean
  activeTimelineId: string
  onClose: () => void
  onSelect: (timeline: PracticeTimeline) => void
}

export default function TimelineLibrarySheet({
  open,
  activeTimelineId,
  onClose,
  onSelect,
}: TimelineLibrarySheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saved = loadTimelines()

  return (
    <AnimatedBottomSheet
      isOpen={open}
      onClose={onClose}
      ariaLabel="Practice Routines"
      vaultTheme
      elevated
    >
      <div className="px-1 pb-2 pt-1">
        <h2 className="px-4 pb-2 text-lg font-bold text-[var(--audio-text-primary)]">
          Practice Routines
        </h2>
      <div className="practice-timeline-library pointer-events-auto">
        <p className="practice-timeline-library__section-title">Templates</p>
        {STARTER_TEMPLATES.map((template) => (
          <Pressable
            key={template.id}
            type="button"
            intensity="soft"
            className="practice-timeline-library__row w-full text-left"
            onClick={() => {
              onSelect(saveTimeline(template.build()))
              onClose()
            }}
          >
            <div>
              <div className="practice-timeline-library__row-name">{template.name}</div>
              <div className="practice-timeline-library__row-meta">{template.description}</div>
            </div>
          </Pressable>
        ))}

        <p className="practice-timeline-library__section-title">Your routines</p>
        {saved.length === 0 ? (
          <p className="px-5 py-3 text-sm text-[var(--audio-text-secondary)]">No saved routines yet</p>
        ) : (
          saved.map((timeline) => (
            <div key={timeline.id} className="practice-timeline-library__row">
              <Pressable
                type="button"
                intensity="soft"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  onSelect(timeline)
                  onClose()
                }}
              >
                <div className="practice-timeline-library__row-name">
                  {timeline.name}
                  {timeline.id === activeTimelineId ? ' · Current' : ''}
                </div>
                <div className="practice-timeline-library__row-meta">
                  {timeline.sections.length} sections
                </div>
              </Pressable>
              <Pressable
                type="button"
                intensity="icon"
                aria-label="Favorite"
                onClick={() => toggleTimelineFavorite(timeline.id)}
              >
                <Star
                  size={18}
                  className={timeline.favorite ? 'text-[var(--audio-gold)]' : 'opacity-30'}
                  fill={timeline.favorite ? 'currentColor' : 'none'}
                />
              </Pressable>
              <Pressable
                type="button"
                intensity="icon"
                aria-label="Duplicate"
                onClick={() => {
                  const copy = duplicateTimeline(timeline.id)
                  if (copy) onSelect(copy)
                }}
              >
                <Copy size={18} />
              </Pressable>
              <Pressable
                type="button"
                intensity="icon"
                aria-label="Export"
                onClick={() => void shareTimelineExport(timeline)}
              >
                <Upload size={18} />
              </Pressable>
            </div>
          ))
        )}

        <Pressable
          type="button"
          intensity="soft"
          className="mx-5 mt-4 w-[calc(100%-2.5rem)] rounded-xl border border-dashed border-[var(--audio-divider)] py-3 text-center text-sm font-semibold text-[var(--audio-blue)]"
          onClick={() => fileInputRef.current?.click()}
        >
          Import routine
        </Pressable>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) {
              void file.text().then((text) => {
                onSelect(importTimeline(text))
                onClose()
              })
            }
            event.target.value = ''
          }}
        />
      </div>
      </div>
    </AnimatedBottomSheet>
  )
}
