import type { CSSProperties } from 'react'
import {
  needsOrientationCorrection,
  type RecordingOrientation,
} from './takeVideoTransform'

export function shouldCorrectPlaybackOrientation(
  recordingOrientation: RecordingOrientation | undefined,
  videoWidth: number,
  videoHeight: number,
): boolean {
  if (videoWidth <= 0 || videoHeight <= 0) return false
  return needsOrientationCorrection(videoWidth, videoHeight, recordingOrientation)
}

export function buildPlaybackShellStyle(
  videoWidth: number,
  videoHeight: number,
): CSSProperties | undefined {
  if (videoWidth <= 0 || videoHeight <= 0) return undefined
  return {
    ['--take-video-w' as string]: String(videoWidth),
    ['--take-video-h' as string]: String(videoHeight),
  }
}

export function takeVideoShellClassName(options: {
  needsLandscapeFix: boolean
  mirror: boolean
  fit: 'cover' | 'contain'
  thumbnailPreview: boolean
}): string {
  const classes = ['take-video-shell']
  if (options.needsLandscapeFix) classes.push('take-video-shell--landscape-fix')
  if (options.mirror) classes.push('take-video-shell--mirror')
  if (options.fit === 'contain') classes.push('take-video-shell--contain')
  if (options.thumbnailPreview) classes.push('take-video-shell--thumbnail')
  return classes.join(' ')
}
