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

export function getAudioRecorderMimeType(): string {
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mpeg',
  ]
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }
  return 'audio/webm'
}

export function getRecorderMimeTypeForMode(mode: 'video' | 'audio'): string {
  return mode === 'audio' ? getAudioRecorderMimeType() : getRecorderMimeType()
}

export function isAudioMimeType(mimeType: string): boolean {
  return mimeType.startsWith('audio/')
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
