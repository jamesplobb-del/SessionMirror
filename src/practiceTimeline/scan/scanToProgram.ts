import { TIME_SIGNATURE_DEFINITIONS, type MetronomeMeter } from '../../metronome/timeSignatureDefinitions'
import { getMeterDefaults } from '../../utils/metronomeConfig'
import { createPatternStep, createPatternStepId } from '../patternLogic'
import { createSectionId } from '../sectionDefaults'
import { accentsFromGrouping } from '../timeSignatureLogic'
import type { SectionSubdivision, TimelineSection } from '../types'
import { groupingFromFeelId, isOddMeter, oddMeterGroupingOptions, suggestFeelIdForGrouping } from './oddMeterGroupings'
import type {
  MusicScanDraftProgram,
  MusicScanDraftSection,
  MusicScanParseResult,
} from './musicScanTypes'

let draftCounter = 0

function draftId(): string {
  draftCounter += 1
  return `scan-draft-${Date.now()}-${draftCounter}`
}

function clampConfidence(value: unknown, fallback = 0.5): number {
  const n = typeof value === 'number' ? value : fallback
  return Math.min(1, Math.max(0, n))
}

function parseMeter(value: unknown): MetronomeMeter {
  if (typeof value === 'string' && value in TIME_SIGNATURE_DEFINITIONS) {
    return value as MetronomeMeter
  }
  return '4/4'
}

function parseSubdivision(value: unknown): SectionSubdivision {
  if (value === 'auto' || value === 'off' || value === '8ths' || value === '16ths' || value === 'triplets') {
    return value
  }
  return 'auto'
}

function pulseModeFromUnit(meter: MetronomeMeter, pulseUnit?: string): string | undefined {
  if (!pulseUnit) return undefined
  const normalized = pulseUnit.toLowerCase()
  if (normalized.includes('dotted') && meter.includes('/8')) return 'compound'
  if (normalized.includes('eighth') && ['6/8', '9/8', '12/8'].includes(meter)) return 'simple-eighth'
  return undefined
}

export function parseResultToDraft(
  result: MusicScanParseResult,
  sourceFiles: MusicScanDraftProgram['sourceFiles'],
  usedDemoParser: boolean,
): MusicScanDraftProgram {
  const sections: MusicScanDraftSection[] = (result.sections ?? []).map((section, index) => {
    const meter = parseMeter(section.meter)
    const grouping = section.grouping?.length ? section.grouping : undefined
    const feelId =
      section.feelLabel?.replace(/\s/g, '') ??
      (grouping ? suggestFeelIdForGrouping(meter, grouping) : undefined)
    const defaults = getMeterDefaults(meter, pulseModeFromUnit(meter, section.pulseUnit))

    let tempoRamp: MusicScanDraftSection['tempoRamp']
    if (section.ritardando || section.accelerando) {
      const base = Math.max(40, Math.min(300, Math.round(section.bpm ?? 80)))
      tempoRamp = {
        enabled: true,
        endBpm: section.endBpm ?? (section.ritardando ? Math.max(40, base - 20) : Math.min(300, base + 20)),
      }
    }

    return {
      id: draftId(),
      title: section.title?.trim() || `Section ${index + 1}`,
      startMeasure: Math.max(1, Math.round(section.startMeasure)),
      endMeasure: Math.max(Math.round(section.endMeasure), Math.round(section.startMeasure)),
      meter,
      pulseModeId: pulseModeFromUnit(meter, section.pulseUnit) ?? defaults.pulseModeId,
      feelId: feelId ?? defaults.feelId,
      beatGrouping: grouping,
      bpm: Math.max(40, Math.min(300, Math.round(section.bpm ?? 80))),
      subdivision: parseSubdivision(section.subdivision),
      repeatCount: Math.max(1, Math.round(section.repeatCount ?? 1)),
      pickupMeasure: Boolean(section.pickupMeasure ?? result.pickupMeasure),
      tempoRamp,
      endings: [],
      navigation: [],
      confidence: clampConfidence(section.confidence, 0.5),
      uncertain: Boolean(section.uncertain ?? section.confidence === undefined),
      notes: section.notes,
      sourcePages: section.sourcePages ?? [],
    }
  })

  return {
    id: draftId(),
    title: result.title?.trim() || 'Scanned Piece',
    sections,
    tempoEvents: (result.tempoEvents ?? []).map((event, index) => ({
      id: `tempo-${index}`,
      measure: Math.max(1, Math.round(event.measure)),
      bpm: Math.max(40, Math.min(300, Math.round(event.bpm ?? 80))),
      marking: event.marking,
      kind: (event.kind as ScanTempoKind) ?? 'tempo',
      confidence: clampConfidence(event.confidence),
      uncertain: Boolean(event.uncertain),
      source: event.page ? { page: event.page } : undefined,
    })),
    meterEvents: (result.meterEvents ?? []).map((event, index) => ({
      id: `meter-${index}`,
      measure: Math.max(1, Math.round(event.measure)),
      meter: event.meter ?? '4/4',
      pulseUnit: event.pulseUnit,
      grouping: event.grouping,
      feelLabel: event.feelLabel,
      confidence: clampConfidence(event.confidence),
      uncertain: Boolean(event.uncertain),
      source: event.page ? { page: event.page } : undefined,
    })),
    repeatBlocks: (result.repeatBlocks ?? []).map((block, index) => ({
      id: `repeat-${index}`,
      fromMeasure: Math.max(1, Math.round(block.fromMeasure)),
      toMeasure: Math.max(1, Math.round(block.toMeasure)),
      times: Math.max(2, Math.round(block.times ?? 2)),
      confidence: clampConfidence(block.confidence),
      uncertain: Boolean(block.uncertain),
    })),
    endings: (result.endings ?? []).map((ending, index) => ({
      id: `ending-${index}`,
      label: ending.label ?? `${index + 1}`,
      measures: ending.measures ?? [],
      confidence: clampConfidence(ending.confidence),
      uncertain: Boolean(ending.uncertain),
    })),
    navigation: (result.navigation ?? [])
      .filter((item) => item.type)
      .map((item, index) => ({
        id: `nav-${index}`,
        type: (item.type as ScanNavType) ?? 'Fine',
        measure: Math.max(1, Math.round(item.measure ?? 1)),
        targetMeasure: item.targetMeasure ? Math.round(item.targetMeasure) : undefined,
        label: item.label,
        confidence: clampConfidence(item.confidence),
        uncertain: Boolean(item.uncertain),
      })),
    pickupMeasure: Boolean(result.pickupMeasure),
    totalMeasures: Math.max(
      result.totalMeasures ?? 0,
      ...sections.map((section) => section.endMeasure),
      1,
    ),
    warnings: result.warnings ?? [],
    sourceFiles,
    scannedAt: Date.now(),
    usedDemoParser,
  }
}

type ScanTempoKind = MusicScanDraftProgram['tempoEvents'][number]['kind']
type ScanNavType = MusicScanDraftProgram['navigation'][number]['type']

export function draftSectionBars(section: MusicScanDraftSection): number {
  return Math.max(1, section.endMeasure - section.startMeasure + 1)
}

function draftTotalMeasures(draft: MusicScanDraftProgram): number {
  return Math.max(
    draft.totalMeasures,
    ...draft.sections.map((section) => section.endMeasure),
    ...draft.meterEvents.map((event) => event.measure),
    1,
  )
}

function findCoveringSection(
  sections: MusicScanDraftSection[],
  measure: number,
): MusicScanDraftSection | undefined {
  return (
    sections.find((section) => measure >= section.startMeasure && measure <= section.endMeasure) ??
    sections.find((section) => section.startMeasure <= measure) ??
    sections[sections.length - 1]
  )
}

/** Per-measure meter map: section ranges first, then meterEvents override from their measure onward. */
export function buildMeasureMeterMap(draft: MusicScanDraftProgram): Map<number, MetronomeMeter> {
  const total = draftTotalMeasures(draft)
  const map = new Map<number, MetronomeMeter>()

  for (const section of [...draft.sections].sort((a, b) => a.startMeasure - b.startMeasure)) {
    for (let measure = section.startMeasure; measure <= section.endMeasure && measure <= total; measure++) {
      map.set(measure, section.meter)
    }
  }

  const meterEvents = [...draft.meterEvents]
    .sort((a, b) => a.measure - b.measure)
    .filter((event) => event.measure >= 1 && event.measure <= total)

  for (let index = 0; index < meterEvents.length; index++) {
    const event = meterEvents[index]
    const nextMeasure = meterEvents[index + 1]?.measure ?? total + 1
    const meter = parseMeter(event.meter)
    for (let measure = event.measure; measure < nextMeasure && measure <= total; measure++) {
      map.set(measure, meter)
    }
  }

  for (let measure = 1; measure <= total; measure++) {
    if (!map.has(measure)) map.set(measure, '4/4')
  }

  return map
}

/** Per-measure BPM map: section ranges first, then tempoEvents override (except rit/accel markers). */
export function buildMeasureBpmMap(draft: MusicScanDraftProgram): Map<number, number> {
  const total = draftTotalMeasures(draft)
  const map = new Map<number, number>()

  for (const section of draft.sections) {
    for (let measure = section.startMeasure; measure <= section.endMeasure && measure <= total; measure++) {
      map.set(measure, section.bpm)
    }
  }

  const tempoEvents = [...draft.tempoEvents]
    .sort((a, b) => a.measure - b.measure)
    .filter(
      (event) =>
        event.measure >= 1 &&
        event.measure <= total &&
        event.kind !== 'ritardando' &&
        event.kind !== 'accelerando',
    )

  for (let index = 0; index < tempoEvents.length; index++) {
    const event = tempoEvents[index]
    const nextMeasure = tempoEvents[index + 1]?.measure ?? total + 1
    for (let measure = event.measure; measure < nextMeasure && measure <= total; measure++) {
      map.set(measure, event.bpm)
    }
  }

  for (let measure = 1; measure <= total; measure++) {
    if (!map.has(measure)) map.set(measure, 80)
  }

  return map
}

interface MeasureSegment {
  startMeasure: number
  endMeasure: number
  meter: MetronomeMeter
  bpm: number
}

function segmentsFromMeasureTimelines(
  total: number,
  meterMap: Map<number, MetronomeMeter>,
  bpmMap: Map<number, number>,
): MeasureSegment[] {
  if (total < 1) return []

  const segments: MeasureSegment[] = []
  let start = 1
  let meter = meterMap.get(1) ?? '4/4'
  let bpm = bpmMap.get(1) ?? 80

  for (let measure = 2; measure <= total + 1; measure++) {
    const atEnd = measure > total
    const nextMeter = meterMap.get(measure) ?? meter
    const nextBpm = bpmMap.get(measure) ?? bpm

    if (atEnd || nextMeter !== meter || nextBpm !== bpm) {
      segments.push({ startMeasure: start, endMeasure: measure - 1, meter, bpm })
      if (!atEnd) {
        start = measure
        meter = nextMeter
        bpm = nextBpm
      }
    }
  }

  return segments
}

function sectionTitleForSegment(
  segment: MeasureSegment,
  parent: MusicScanDraftSection | undefined,
  index: number,
  totalSegments: number,
): string {
  if (!parent) return `Section ${index + 1}`

  const isFirstInParent = segment.startMeasure === parent.startMeasure
  if (totalSegments === 1 || (isFirstInParent && segment.meter === parent.meter)) {
    return parent.title
  }

  if (isFirstInParent) {
    return `${parent.title} (${segment.meter})`
  }

  const span =
    segment.startMeasure === segment.endMeasure
      ? `m.${segment.startMeasure}`
      : `m.${segment.startMeasure}–${segment.endMeasure}`
  return `${parent.title} · ${span} (${segment.meter})`
}

/**
 * Split sections at every meter/tempo boundary using meterEvents and tempoEvents.
 * Ensures mid-piece meter changes become separate practice sections.
 */
export function reconcileMeterAndTempoIntoSections(
  draft: MusicScanDraftProgram,
): MusicScanDraftProgram {
  if (draft.sections.length === 0) return draft

  const total = draftTotalMeasures(draft)
  const meterMap = buildMeasureMeterMap(draft)
  const bpmMap = buildMeasureBpmMap(draft)
  const segments = segmentsFromMeasureTimelines(total, meterMap, bpmMap)

  if (segments.length === 0) return draft

  const originalSections = draft.sections
  const newSections: MusicScanDraftSection[] = segments.map((segment, index) => {
    const parent = findCoveringSection(originalSections, segment.startMeasure)
    const meterEvent = draft.meterEvents.find((event) => event.measure === segment.startMeasure)
    const tempoEvent = draft.tempoEvents.find((event) => event.measure === segment.startMeasure)

    const grouping =
      meterEvent?.grouping?.length
        ? meterEvent.grouping
        : segment.startMeasure === parent?.startMeasure
          ? parent?.beatGrouping
          : undefined

    const feelId =
      meterEvent?.feelLabel?.replace(/\s/g, '') ??
      (grouping ? suggestFeelIdForGrouping(segment.meter, grouping) : parent?.feelId)

    const defaults = getMeterDefaults(
      segment.meter,
      pulseModeFromUnit(segment.meter, meterEvent?.pulseUnit),
    )

    const meterChanged =
      Boolean(meterEvent) ||
      (parent !== undefined && segment.meter !== parent.meter && segment.startMeasure > parent.startMeasure)

    const tempoChanged =
      Boolean(tempoEvent && tempoEvent.kind !== 'ritardando' && tempoEvent.kind !== 'accelerando') ||
      (parent !== undefined && segment.bpm !== parent.bpm && segment.startMeasure > parent.startMeasure)

    let tempoRamp = parent?.tempoRamp
    if (tempoEvent?.kind === 'ritardando' || tempoEvent?.kind === 'accelerando') {
      const base = segment.bpm
      tempoRamp = {
        enabled: true,
        endBpm:
          tempoEvent.kind === 'ritardando'
            ? Math.max(40, base - 20)
            : Math.min(300, base + 20),
      }
    } else if (meterChanged || tempoChanged) {
      tempoRamp = undefined
    }

    const notes = [
      parent?.notes,
      meterEvent ? `Meter change at m.${meterEvent.measure}` : undefined,
      tempoEvent?.marking ? `Tempo: ${tempoEvent.marking}` : undefined,
    ]
      .filter(Boolean)
      .join(' · ')

    return {
      id: draftId(),
      title: sectionTitleForSegment(segment, parent, index, segments.length),
      startMeasure: segment.startMeasure,
      endMeasure: segment.endMeasure,
      meter: segment.meter,
      pulseModeId:
        pulseModeFromUnit(segment.meter, meterEvent?.pulseUnit) ??
        (segment.meter === parent?.meter ? parent?.pulseModeId : undefined) ??
        defaults.pulseModeId,
      feelId: feelId ?? defaults.feelId,
      beatGrouping: grouping,
      bpm: segment.bpm,
      subdivision: parent?.subdivision ?? 'auto',
      repeatCount: parent?.repeatCount ?? 1,
      pickupMeasure: segment.startMeasure === 1 && (parent?.pickupMeasure ?? draft.pickupMeasure),
      tempoRamp,
      endings: parent?.endings ?? [],
      navigation: parent?.navigation ?? [],
      confidence: Math.min(
        parent?.confidence ?? 0.5,
        meterEvent?.confidence ?? 1,
        tempoEvent?.confidence ?? 1,
      ),
      uncertain: Boolean(
        parent?.uncertain ||
          meterEvent?.uncertain ||
          tempoEvent?.uncertain ||
          (meterChanged && !meterEvent),
      ),
      notes: notes || undefined,
      sourcePages: parent?.sourcePages ?? [],
    }
  })

  return { ...draft, sections: newSections, totalMeasures: total }
}

/** Add warnings when scan data is inconsistent before/after reconciliation. */
export function validateDraftConsistency(draft: MusicScanDraftProgram): MusicScanDraftProgram {
  const warnings = [...draft.warnings]
  const total = draftTotalMeasures(draft)
  const covered = new Set<number>()

  for (const section of draft.sections) {
    for (let measure = section.startMeasure; measure <= section.endMeasure; measure++) {
      covered.add(measure)
    }
  }

  for (let measure = 1; measure <= total; measure++) {
    if (!covered.has(measure)) {
      warnings.push(`No section covers measure ${measure}.`)
    }
  }

  for (const event of draft.meterEvents) {
    const section = draft.sections.find((item) => item.startMeasure === event.measure)
    if (section && parseMeter(event.meter) !== section.meter) {
      warnings.push(
        `Meter event at m.${event.measure} (${event.meter}) does not match section start (${section.meter}).`,
      )
    }
    if (!section) {
      warnings.push(`Meter event at m.${event.measure} has no matching section start.`)
    }
  }

  for (const section of draft.sections) {
    const internalEvents = draft.meterEvents.filter(
      (event) => event.measure > section.startMeasure && event.measure <= section.endMeasure,
    )
    if (internalEvents.length > 0) {
      warnings.push(
        `Section "${section.title}" (m.${section.startMeasure}–${section.endMeasure}) spans ${internalEvents.length} internal meter change(s) — split into separate sections.`,
      )
    }
  }

  const uniqueWarnings = [...new Set(warnings)]
  return uniqueWarnings.length === draft.warnings.length ? draft : { ...draft, warnings: uniqueWarnings }
}

export function draftToTimelineSections(draft: MusicScanDraftProgram): TimelineSection[] {
  return draft.sections.map((section) => {
    const bars = draftSectionBars(section)
    const grouping = section.beatGrouping ?? groupingFromFeelId(section.meter, section.feelId ?? '')
    const customAccents = grouping?.length ? accentsFromGrouping(grouping) : undefined

    const navNotes = section.navigation
      .map((nav) => `${nav.type}${nav.targetMeasure ? ` → m.${nav.targetMeasure}` : ''}`)
      .join(', ')
    const endingNotes = section.endings.map((e) => `Ending ${e.label}: m.${e.measures.join(',')}`).join('; ')
    const markerNotes = [section.notes, navNotes, endingNotes].filter(Boolean).join(' · ')

    const timelineSection: TimelineSection = {
      id: createSectionId(),
      title: section.title,
      bars,
      bpm: section.bpm,
      meter: section.meter,
      pulseModeId: section.pulseModeId,
      feelId: grouping ? undefined : section.feelId,
      subdivision: section.subdivision,
      repeatCount: section.repeatCount,
      advanced: {
        beatGrouping: grouping,
        customAccents,
        tempoRamp: section.tempoRamp,
        pickupMeasure: section.pickupMeasure,
        markerNotes: markerNotes || undefined,
      },
      patternSteps: section.patternSteps,
      patternRepeat: section.patternRepeat,
    }

    return timelineSection
  })
}

/** Merge consecutive sections with alternating meters into pattern steps when appropriate. */
export function optimizeDraftPatterns(draft: MusicScanDraftProgram): MusicScanDraftProgram {
  const sections = [...draft.sections]
  const merged: MusicScanDraftSection[] = []

  let index = 0
  while (index < sections.length) {
    const current = sections[index]
    const next = sections[index + 1]

    if (
      next &&
      draftSectionBars(current) === 1 &&
      draftSectionBars(next) === 1 &&
      current.meter !== next.meter &&
      current.endMeasure + 1 === next.startMeasure
    ) {
      const patternSteps = [current, next]
      let cursor = index + 2
      while (cursor < sections.length) {
        const candidate = sections[cursor]
        if (draftSectionBars(candidate) !== 1) break
        const expectedMeter = patternSteps[patternSteps.length % 2].meter
        if (candidate.meter !== expectedMeter) break
        patternSteps.push(candidate)
        cursor += 1
      }

      if (patternSteps.length >= 2) {
        const start = patternSteps[0].startMeasure
        const end = patternSteps[patternSteps.length - 1].endMeasure
        const cycleMeasures = patternSteps.length
        const totalSpan = end - start + 1
        const cycles = Math.max(1, Math.round(totalSpan / cycleMeasures))

        merged.push({
          ...current,
          id: draftId(),
          title: patternSteps.map((s) => s.meter).join(' + '),
          startMeasure: start,
          endMeasure: end,
          patternSteps: patternSteps.map((step) =>
            createPatternStep(step.meter, step.bpm, {
              id: createPatternStepId(),
              pulseModeId: step.pulseModeId,
              feelId: step.feelId,
              beatGrouping: step.beatGrouping,
              subdivision: step.subdivision,
            }),
          ),
          patternRepeat: { kind: 'cycles', cycles },
          uncertain: patternSteps.some((step) => step.uncertain),
          confidence: Math.min(...patternSteps.map((step) => step.confidence)),
          notes: 'Auto-merged alternating meter pattern from scan',
        })
        index = cursor
        continue
      }
    }

    merged.push(current)
    index += 1
  }

  return { ...draft, sections: merged }
}

export function attachRepeatBlocksToDraft(draft: MusicScanDraftProgram): MusicScanDraftProgram {
  const sections = draft.sections.map((section) => {
    const block = draft.repeatBlocks.find(
      (repeat) =>
        repeat.fromMeasure >= section.startMeasure && repeat.toMeasure <= section.endMeasure,
    )
    if (!block) return section
    return {
      ...section,
      repeatBlock: block,
      repeatCount: block.times,
      uncertain: Boolean(section.uncertain || block.uncertain),
    }
  })
  return { ...draft, sections }
}

export function suggestGroupingForDraftSection(section: MusicScanDraftSection): MusicScanDraftSection {
  if (!isOddMeter(section.meter) || section.beatGrouping?.length) return section
  const first = oddMeterGroupingOptions(section.meter)[0]
  if (!first) return section
  return {
    ...section,
    feelId: first.id,
    beatGrouping: first.grouping,
    uncertain: section.uncertain,
  }
}
