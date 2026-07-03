import { useCallback, useEffect, useRef, useState } from 'react'
import {
  timelinePlaybackEngine,
  TEMPO_SCALE_STEP,
} from '../playback/timelinePlaybackEngine'
import { saveTimeline, loadOrCreateActiveTimeline } from '../storage/timelineStorage'
import { createDefaultSection } from '../sectionDefaults'
import { normalizeTimeline } from '../timelineNormalize'
import type {
  PracticeTimeline,
  PracticeTimelineMarker,
  PracticeTrackSettings,
  TimelinePlaybackState,
  TimelineSection,
} from '../types'

export function usePracticeTimeline() {
  const [timeline, setTimeline] = useState<PracticeTimeline>(() =>
    normalizeTimeline(loadOrCreateActiveTimeline()),
  )
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null)

  const persist = useCallback((next: PracticeTimeline) => {
    const saved = saveTimeline(next)
    setTimeline(saved)
    return saved
  }, [])

  const addSection = useCallback(() => {
    const section = createDefaultSection({ title: `Section ${timeline.sections.length + 1}` })
    persist({ ...timeline, sections: [...timeline.sections, section] })
    setEditingSectionId(section.id)
  }, [persist, timeline])

  const updateSection = useCallback(
    (sectionId: string, patch: Partial<TimelineSection>) => {
      persist({
        ...timeline,
        sections: timeline.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
      })
    },
    [persist, timeline],
  )

  const deleteSection = useCallback(
    (sectionId: string) => {
      persist({ ...timeline, sections: timeline.sections.filter((s) => s.id !== sectionId) })
      if (editingSectionId === sectionId) setEditingSectionId(null)
    },
    [editingSectionId, persist, timeline],
  )

  const duplicateSection = useCallback(
    (sectionId: string) => {
      const source = timeline.sections.find((s) => s.id === sectionId)
      if (!source) return
      const newSection = createDefaultSection({ ...source, title: `${source.title} Copy` })
      const index = timeline.sections.findIndex((s) => s.id === sectionId)
      const sections = [...timeline.sections]
      sections.splice(index + 1, 0, newSection)
      persist({ ...timeline, sections })
    },
    [persist, timeline],
  )

  const reorderSections = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return
      const sections = [...timeline.sections]
      const [moved] = sections.splice(fromIndex, 1)
      sections.splice(toIndex, 0, moved)
      persist({ ...timeline, sections })
    },
    [persist, timeline],
  )

  const loadTimeline = useCallback((next: PracticeTimeline) => {
    const saved = saveTimeline(normalizeTimeline(next))
    setTimeline(saved)
    setEditingSectionId(null)
  }, [])

  const renameTimeline = useCallback(
    (name: string) => persist({ ...timeline, name: name.trim() || timeline.name }),
    [persist, timeline],
  )

  const updateTrackSettings = useCallback(
    (patch: Partial<PracticeTrackSettings>) => {
      persist({
        ...timeline,
        settings: {
          countInBars: timeline.settings?.countInBars ?? 0,
          countInWhen: timeline.settings?.countInWhen ?? 'start',
          loopTrack: timeline.settings?.loopTrack ?? false,
          ...patch,
        },
      })
    },
    [persist, timeline],
  )

  return {
    timeline,
    editingSectionId,
    setEditingSectionId,
    addSection,
    updateSection,
    deleteSection,
    duplicateSection,
    reorderSections,
    loadTimeline,
    renameTimeline,
    updateTrackSettings,
    persist,
  }
}

export function useTimelinePlayback() {
  const [playbackState, setPlaybackState] = useState<TimelinePlaybackState>(() =>
    timelinePlaybackEngine.getState(),
  )
  const onFinishedRef = useRef<((markers: PracticeTimelineMarker[]) => void) | undefined>(undefined)

  useEffect(() => {
    timelinePlaybackEngine.setCallbacks({
      onStateChange: setPlaybackState,
      onFinished: (markers) => onFinishedRef.current?.(markers),
    })
    return () => timelinePlaybackEngine.setCallbacks({})
  }, [])

  const prepareSession = useCallback(
    (
      timeline: PracticeTimeline,
      options?: {
        recordingOffsetSeconds?: number
        startSectionIndex?: number
        onFinished?: (m: PracticeTimelineMarker[]) => void
      },
    ) => {
      onFinishedRef.current = options?.onFinished
      return timelinePlaybackEngine.prepareSession(timeline, {
        recordingOffsetSeconds: options?.recordingOffsetSeconds,
        startSectionIndex: options?.startSectionIndex,
      })
    },
    [],
  )

  const togglePlay = useCallback(() => timelinePlaybackEngine.togglePlay(), [])
  const exitSession = useCallback(() => timelinePlaybackEngine.exitSession(), [])
  const resetSession = useCallback(() => timelinePlaybackEngine.resetToBeginning(), [])
  const setTempoScale = useCallback((scale: number) => timelinePlaybackEngine.setTempoScale(scale), [])
  const adjustTempoScale = useCallback(
    (delta: number) => timelinePlaybackEngine.adjustTempoScale(delta),
    [],
  )
  const goToSection = useCallback((index: number) => timelinePlaybackEngine.goToSection(index), [])
  const skipSection = useCallback(
    (direction: -1 | 1) => timelinePlaybackEngine.skipSection(direction),
    [],
  )

  return {
    playbackState,
    prepareSession,
    togglePlay,
    exitSession,
    resetSession,
    setTempoScale,
    adjustTempoScale,
    goToSection,
    skipSection,
    sessionTimeline: timelinePlaybackEngine.getTimeline(),
    currentSection: timelinePlaybackEngine.getCurrentSection(),
    nextSection: timelinePlaybackEngine.getNextSection(),
    tempoScaleStep: TEMPO_SCALE_STEP,
  }
}
