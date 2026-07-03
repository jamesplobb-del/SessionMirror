import type { MetronomeMeter } from '../utils/metronomeConfig'
import type { PracticeTimeline, SectionRepeat, TimelineSection } from './types'

let sectionCounter = 0

export function createSectionId(): string {
  sectionCounter += 1
  return `section-${Date.now()}-${sectionCounter}`
}

export function createDefaultSection(overrides?: Partial<TimelineSection>): TimelineSection {
  return {
    id: createSectionId(),
    title: 'New Section',
    bars: 4,
    bpm: 80,
    meter: '4/4',
    subdivision: 'auto',
    repeat: 'none',
    ...overrides,
  }
}

export function createTimelineId(): string {
  return `timeline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyTimeline(name = 'My Practice'): PracticeTimeline {
  const now = Date.now()
  return {
    id: createTimelineId(),
    name,
    sections: [],
    favorite: false,
    createdAt: now,
    updatedAt: now,
  }
}

export const COMMON_METERS: MetronomeMeter[] = [
  '2/4',
  '3/4',
  '4/4',
  '5/4',
  '6/8',
  '9/8',
  '12/8',
  '5/8',
  '7/8',
]

export const REPEAT_OPTIONS: { id: SectionRepeat; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: '2x', label: '2×' },
  { id: '3x', label: '3×' },
  { id: '4x', label: '4×' },
]

export function repeatMultiplier(repeat: SectionRepeat): number {
  switch (repeat) {
    case '2x':
      return 2
    case '3x':
      return 3
    case '4x':
      return 4
    default:
      return 1
  }
}
