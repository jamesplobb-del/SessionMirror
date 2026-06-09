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

export function isLandscapeViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.innerWidth > window.innerHeight
}

/** Front-camera constraints tuned for portrait or landscape recording. */
export function getVideoCaptureConstraints(): MediaTrackConstraints {
  const landscape = isLandscapeViewport()

  return {
    facingMode: 'user',
    width: { ideal: landscape ? 1920 : 1080, min: 720 },
    height: { ideal: landscape ? 1080 : 1920, min: 720 },
    frameRate: { ideal: 30, max: 30 },
  }
}

export function getAudioCaptureConstraints(): MediaTrackConstraints {
  return {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48000 },
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: false },
    autoGainControl: { ideal: false },
  }
}

function estimateVideoBitrate(width: number, height: number): number {
  const pixels = width * height
  if (pixels >= 1920 * 1080) return 10_000_000
  if (pixels >= 1280 * 720) return 8_000_000
  if (pixels >= 960 * 540) return 5_500_000
  return 3_500_000
}

export function createMediaRecorder(
  stream: MediaStream,
  mimeType: string,
): MediaRecorder {
  const isVideo = !isAudioMimeType(mimeType)

  if (!isVideo) {
    const audioOptions: MediaRecorderOptions = {
      mimeType,
      audioBitsPerSecond: 192_000,
    }
    try {
      return new MediaRecorder(stream, audioOptions)
    } catch {
      return new MediaRecorder(stream, { mimeType })
    }
  }

  const track = stream.getVideoTracks()[0]
  const settings = track?.getSettings()
  const width = settings?.width ?? (isLandscapeViewport() ? 1920 : 1080)
  const height = settings?.height ?? (isLandscapeViewport() ? 1080 : 1920)

  const qualityOptions: MediaRecorderOptions = {
    mimeType,
    videoBitsPerSecond: estimateVideoBitrate(width, height),
    audioBitsPerSecond: 192_000,
  }

  try {
    return new MediaRecorder(stream, qualityOptions)
  } catch {
    try {
      return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 192_000 })
    } catch {
      return new MediaRecorder(stream, { mimeType })
    }
  }
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
