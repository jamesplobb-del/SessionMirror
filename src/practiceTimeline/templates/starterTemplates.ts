import type { PracticeTimeline } from '../types'
import { createDefaultSection } from '../sectionDefaults'

export interface TimelineTemplate {
  id: string
  name: string
  description: string
  build: () => PracticeTimeline
}

function template(
  id: string,
  name: string,
  description: string,
  sections: Partial<import('../types').TimelineSection>[],
): TimelineTemplate {
  return {
    id,
    name,
    description,
    build: () => {
      const now = Date.now()
      return {
        id: `template-${id}-${now}`,
        name,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        sections: sections.map((overrides, index) =>
          createDefaultSection({
            title: overrides.title ?? `Section ${index + 1}`,
            ...overrides,
          }),
        ),
      }
    },
  }
}

export const STARTER_TEMPLATES: TimelineTemplate[] = [
  template('trumpet-warmup', 'Trumpet Warmup', 'Long tones, lip slurs, scales, articulation', [
    { title: 'Long Tones', bars: 4, bpm: 60, meter: '4/4' },
    { title: 'Lip Slurs', bars: 8, bpm: 72, meter: '4/4' },
    { title: 'Scales', bars: 8, bpm: 96, meter: '4/4' },
    { title: 'Articulation', bars: 4, bpm: 108, meter: '4/4' },
  ]),
  template('jazz-practice', 'Jazz Practice', 'Ballad, medium swing, up-tempo', [
    { title: 'Ballad', bars: 8, bpm: 72, meter: '4/4' },
    { title: 'Medium Swing', bars: 16, bpm: 120, meter: '4/4' },
    { title: 'Up Tempo', bars: 8, bpm: 180, meter: '4/4' },
  ]),
  template('drum-rudiments', 'Drum Rudiments', 'Singles, doubles, paradiddles', [
    { title: 'Singles', bars: 4, bpm: 80, meter: '4/4', subdivision: '16ths' },
    { title: 'Doubles', bars: 4, bpm: 90, meter: '4/4', subdivision: '16ths' },
    { title: 'Paradiddles', bars: 4, bpm: 100, meter: '4/4', subdivision: '16ths' },
  ]),
  template('odd-meter', 'Odd Meter Practice', '5/8 and 7/8 with grouping', [
    { title: '5/8 Feel', bars: 8, bpm: 132, meter: '5/8', feelId: '3+2' },
    { title: '7/8 Feel', bars: 8, bpm: 120, meter: '7/8', feelId: '2+2+3' },
    { title: 'Mixed', bars: 8, bpm: 108, meter: '5/8', feelId: '2+3' },
  ]),
  template('choir-warmups', 'Choir Warmups', 'Breathing, unison, harmony', [
    { title: 'Breathing', bars: 4, bpm: 60, meter: '4/4' },
    { title: 'Unison', bars: 8, bpm: 72, meter: '4/4' },
    { title: 'Harmony', bars: 8, bpm: 80, meter: '4/4' },
  ]),
  template('beginner', 'Beginner Practice', 'Simple warm-up and etude', [
    { title: 'Warm Up', bars: 4, bpm: 72, meter: '4/4' },
    { title: 'Etude', bars: 8, bpm: 80, meter: '4/4' },
    { title: 'Cool Down', bars: 4, bpm: 64, meter: '4/4' },
  ]),
]
