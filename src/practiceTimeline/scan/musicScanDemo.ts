import type { MusicScanParseResult } from './musicScanTypes'

/** Demo parse result for UI development when no vision API is configured. */
export function createDemoScanResult(): MusicScanParseResult {
  return {
    title: 'Alternating Feel (Demo)',
    totalMeasures: 24,
    pickupMeasure: false,
    warnings: [
      'Demo scan — configure VITE_OPENAI_API_KEY or VITE_MUSIC_SCAN_API_URL for real analysis.',
    ],
    sections: [
      {
        title: 'A — 3/4',
        startMeasure: 1,
        endMeasure: 12,
        meter: '3/4',
        bpm: 120,
        tempoMarking: '♩=120',
        confidence: 0.55,
        uncertain: true,
        sourcePages: [1],
        notes: 'Demo: alternating 3/4 section',
      },
      {
        title: 'B — 6/8',
        startMeasure: 13,
        endMeasure: 24,
        meter: '6/8',
        bpm: 80,
        tempoMarking: '♩·=80',
        pulseUnit: 'dottedQuarter',
        confidence: 0.5,
        uncertain: true,
        sourcePages: [1],
        notes: 'Demo: compound 6/8',
      },
    ],
    tempoEvents: [
      { measure: 1, bpm: 120, marking: '♩=120', kind: 'tempo', confidence: 0.5, uncertain: true, page: 1 },
      { measure: 13, bpm: 80, marking: '♩·=80', kind: 'tempo', confidence: 0.45, uncertain: true, page: 1 },
    ],
    meterEvents: [
      { measure: 1, meter: '3/4', confidence: 0.6, uncertain: true, page: 1 },
      { measure: 13, meter: '6/8', confidence: 0.55, uncertain: true, page: 1 },
    ],
    repeatBlocks: [],
    endings: [],
    navigation: [],
  }
}
