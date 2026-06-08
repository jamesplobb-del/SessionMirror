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

/** MediaRecorder timeslice — flush a chunk to disk every N ms on native */
export const RECORDING_TIMESLICE_MS = 1000
