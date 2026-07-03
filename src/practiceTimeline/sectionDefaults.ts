import type { MetronomeMeter } from '../utils/metronomeConfig'
import { createPatternStep } from './patternLogic'
import type { PracticeTimeline, TimelineSection } from './types'

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
    repeatCount: 1,
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
    settings: {
      countInBars: 0,
      countInWhen: 'start',
      loopTrack: false,
    },
    createdAt: now,
    updatedAt: now,
  }
}

export const COMMON_METERS: MetronomeMeter[] = [
  '2/4',
  '3/4',
  '4/4',
  '5/4',
  '6/4',
  '7/4',
  '2/2',
  '3/8',
  '4/8',
  '6/8',
  '9/8',
  '12/8',
  '5/8',
  '7/8',
  '8/8',
  '10/8',
  '11/8',
  '13/8',
  '15/8',
  '16/8',
]

export function repeatMultiplier(repeatCount: number): number {
  return Math.max(1, Math.min(99, Math.round(repeatCount)))
}

export function repeatLabel(repeatCount: number): string {
  const count = repeatMultiplier(repeatCount)
  return count <= 1 ? 'Once' : `${count}×`
}

export function createAlternatingPatternSection(): TimelineSection {
  return createDefaultSection({
    title: 'Alternating Feel',
    meter: '3/4',
    bpm: 120,
    patternSteps: [createPatternStep('3/4', 120), createPatternStep('6/8', 80)],
    patternRepeat: { kind: 'totalMeasures', measures: 24 },
  })
}
