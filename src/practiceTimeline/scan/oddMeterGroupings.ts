import type { MetronomeMeter } from '../../utils/metronomeConfig'

export interface OddMeterGroupingOption {
  id: string
  label: string
  grouping: number[]
}

const ODD_METER_GROUPINGS: Partial<Record<MetronomeMeter, OddMeterGroupingOption[]>> = {
  '5/8': [
    { id: '2+3', label: '2+3', grouping: [2, 3] },
    { id: '3+2', label: '3+2', grouping: [3, 2] },
  ],
  '7/8': [
    { id: '2+2+3', label: '2+2+3', grouping: [2, 2, 3] },
    { id: '2+3+2', label: '2+3+2', grouping: [2, 3, 2] },
    { id: '3+2+2', label: '3+2+2', grouping: [3, 2, 2] },
  ],
  '8/8': [
    { id: '3+3+2', label: '3+3+2', grouping: [3, 3, 2] },
    { id: '2+3+3', label: '2+3+3', grouping: [2, 3, 3] },
    { id: '2+2+2+2', label: '2+2+2+2', grouping: [2, 2, 2, 2] },
  ],
  '10/8': [
    { id: '3+3+2+2', label: '3+3+2+2', grouping: [3, 3, 2, 2] },
    { id: '2+2+3+3', label: '2+2+3+3', grouping: [2, 2, 3, 3] },
    { id: '5+5', label: '5+5', grouping: [5, 5] },
  ],
  '11/8': [
    { id: '3+3+3+2', label: '3+3+3+2', grouping: [3, 3, 3, 2] },
    { id: '3+3+2+3', label: '3+3+2+3', grouping: [3, 3, 2, 3] },
    { id: '2+3+3+3', label: '2+3+3+3', grouping: [2, 3, 3, 3] },
  ],
  '13/8': [
    { id: '3+3+3+2+2', label: '3+3+3+2+2', grouping: [3, 3, 3, 2, 2] },
    { id: '3+3+2+3+2', label: '3+3+2+3+2', grouping: [3, 3, 2, 3, 2] },
  ],
  '15/16': [
    { id: '3+3+3+3+3', label: '3+3+3+3+3', grouping: [3, 3, 3, 3, 3] },
    { id: '5+5+5', label: '5+5+5', grouping: [5, 5, 5] },
  ],
}

export function oddMeterGroupingOptions(meter: MetronomeMeter): OddMeterGroupingOption[] {
  return ODD_METER_GROUPINGS[meter] ?? []
}

export function isOddMeter(meter: MetronomeMeter): boolean {
  return Boolean(ODD_METER_GROUPINGS[meter]?.length)
}

export function suggestFeelIdForGrouping(meter: MetronomeMeter, grouping: number[]): string | undefined {
  const label = grouping.join('+')
  const match = oddMeterGroupingOptions(meter).find((option) => option.label === label)
  return match?.id
}

export function groupingFromFeelId(meter: MetronomeMeter, feelId: string): number[] | undefined {
  return oddMeterGroupingOptions(meter).find((option) => option.id === feelId)?.grouping
}
