import type { VideoHTMLAttributes } from 'react'

/** Shared inline-playback attributes for iOS / mobile Safari */
export const mobileVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  playsInline: true,
  ...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>),
}

/** iOS-friendly attributes for replaying saved local takes */
export const iosReplayVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  ...mobileVideoProps,
  controls: true,
  preload: 'metadata',
}

export function getRecorderMimeType(): string {
  return MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : 'video/webm'
}

/** MediaRecorder timeslice — flush a chunk to disk every N ms on native */
export const RECORDING_TIMESLICE_MS = 1000
