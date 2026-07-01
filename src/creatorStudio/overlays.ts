import type { Take } from '../types'
import type { CreatorStudioOverlayKind, CreatorStudioOverlayModule } from './types'

interface OverlayPreset {
  kind: CreatorStudioOverlayKind
  label: string
  defaultText: (take: Take) => string
  enabled: boolean
  position: { x: number; y: number }
}

function formatPracticeDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export const CREATOR_STUDIO_OVERLAY_PRESETS: OverlayPreset[] = [
  {
    kind: 'title',
    label: 'Title',
    defaultText: (take) => take.name || 'BestTake',
    enabled: true,
    position: { x: 50, y: 12 },
  },
  {
    kind: 'subtitle',
    label: 'Subtitle',
    defaultText: () => 'Practice session',
    enabled: false,
    position: { x: 50, y: 20 },
  },
  {
    kind: 'watermark',
    label: 'BestTake watermark',
    defaultText: () => 'BestTake',
    enabled: true,
    position: { x: 78, y: 91 },
  },
  {
    kind: 'instrument',
    label: 'Instrument',
    defaultText: () => 'Instrument',
    enabled: false,
    position: { x: 24, y: 84 },
  },
  {
    kind: 'practiceDate',
    label: 'Practice date',
    defaultText: (take) => formatPracticeDate(take.timestamp),
    enabled: true,
    position: { x: 50, y: 84 },
  },
]

export function createDefaultCreatorStudioOverlays(take: Take): CreatorStudioOverlayModule[] {
  return CREATOR_STUDIO_OVERLAY_PRESETS.map((preset) => ({
    id: preset.kind,
    kind: preset.kind,
    label: preset.label,
    text: preset.defaultText(take),
    enabled: preset.enabled,
    position: preset.position,
  }))
}
