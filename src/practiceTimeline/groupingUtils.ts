import { resolveSectionPulse } from './timeSignatureLogic'
import type { MetronomeMeter } from '../utils/metronomeConfig'
import type { TimelineSection } from './types'

/** Parse "2+2+3" or "2 2 3" into [2, 2, 3]. Returns null if invalid. */
export function parseGroupingInput(text: string): number[] | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const parts = trimmed
    .split(/[+,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 0) return null

  const grouping: number[] = []
  for (const part of parts) {
    const value = Number.parseInt(part, 10)
    if (!Number.isFinite(value) || value < 1 || value > 32) return null
    grouping.push(value)
  }

  return grouping
}

export function formatGrouping(grouping: number[]): string {
  return grouping.join('+')
}

export function groupingSum(grouping: number[]): number {
  return grouping.reduce((sum, value) => sum + value, 0)
}

export function validateGroupingForMeter(grouping: number[], section: TimelineSection): boolean {
  const resolved = resolveSectionPulse(section)
  return groupingSum(grouping) === resolved.pulseCount
}

export function groupingValidationMessage(section: TimelineSection): string {
  const resolved = resolveSectionPulse(section)
  return `Groups must add up to ${resolved.pulseCount} (e.g. 2+2+3)`
}

/** @deprecated Use validateGroupingForMeter with section */
export function validateGroupingForMeterLegacy(grouping: number[], meter: MetronomeMeter): boolean {
  const sum = groupingSum(grouping)
  const [numerator] = meter.split('/').map(Number)
  return sum === numerator
}
