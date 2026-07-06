export const CREATOR_STUDIO_MIN_VIDEO_RATIO = 30
export const CREATOR_STUDIO_MAX_VIDEO_RATIO = 70
export const CREATOR_STUDIO_VIDEO_RATIO_PRESETS = [70, 60, 50, 40, 30] as const

export function clampVideoSheetRatio(ratio: number): number {
  return Math.min(
    CREATOR_STUDIO_MAX_VIDEO_RATIO,
    Math.max(CREATOR_STUDIO_MIN_VIDEO_RATIO, Math.round(ratio)),
  )
}
