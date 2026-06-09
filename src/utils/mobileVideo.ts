import { Capacitor } from '@capacitor/core'
import type { VideoHTMLAttributes } from 'react'

/** Shared inline-playback attributes for iOS / mobile Safari (live camera). */
export const mobileVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  playsInline: true,
  ...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>),
}

/**
 * Required attrs for replaying saved takes on iOS WebKit.
 * Muted prevents audio-session lock / main-thread freezes on init.
 */
export const iosTakeVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  playsInline: true,
  muted: true,
  disablePictureInPicture: true,
  preload: 'metadata',
  ...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>),
}

/** @deprecated Use iosTakeVideoProps */
export const iosReplayVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  ...iosTakeVideoProps,
  controls: true,
}

export function getRecorderMimeType(): string {
  return MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
}

/** MediaRecorder timeslice — used only when chunks can be appended safely (webm). */
export const RECORDING_TIMESLICE_MS = 1000

/**
 * iOS/mp4 MediaRecorder emits fMP4 fragments; concatenating them corrupts A/V sync
 * on longer takes. Record as a single blob instead.
 */
export function shouldUseRecordingTimeslice(mimeType: string): boolean {
  if (!Capacitor.isNativePlatform()) {
    return false
  }
  if (mimeType.includes('mp4') || Capacitor.getPlatform() === 'ios') {
    return false
  }
  return true
}

/** WebKit hack — forces the first frame to render as an inline poster/thumbnail. */
export function withWebKitThumbnailHint(src: string): string {
  if (!src || src.includes('#t=')) {
    return src
  }
  return `${src}#t=0.1`
}
