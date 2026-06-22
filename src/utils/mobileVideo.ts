import { Capacitor } from '@capacitor/core'
import type { VideoHTMLAttributes } from 'react'
import type { RecordingOrientation } from './takeVideoTransform'
import {
  getMusicRecordingAudioConstraints,
  RECORDING_AUDIO_BITS_PER_SECOND,
} from './audioCapture'
import { getVideoCaptureConstraintsForOrientation } from './videoCapture'

/** Shared inline-playback attributes for iOS / mobile Safari (live camera). */
export const mobileVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  playsInline: true,
  preload: 'auto',
  controls: false,
  disablePictureInPicture: true,
  ...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>),
}

/**
 * Required attrs for every `<video>` on iOS WKWebView — prevents fullscreen hijack
 * and RBS media-playback assertion termination.
 */
export const iosBulletproofVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  playsInline: true,
  preload: 'auto',
  controls: false,
  disablePictureInPicture: true,
  ...({ 'webkit-playsinline': 'true' } as VideoHTMLAttributes<HTMLVideoElement>),
}

/**
 * Required attrs for replaying saved takes on iOS WebKit.
 * Muted prevents audio-session lock / main-thread freezes on init.
 */
export const iosTakeVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  ...iosBulletproofVideoProps,
  muted: true,
}

/** @deprecated Use iosBulletproofVideoProps */
export const iosReplayVideoProps: VideoHTMLAttributes<HTMLVideoElement> = {
  ...iosTakeVideoProps,
}

/** Apply bulletproof inline attrs directly on a DOM video element. */
export function applyBulletproofVideoElement(video: HTMLVideoElement): void {
  video.playsInline = true
  video.preload = 'auto'
  video.controls = false
  video.disablePictureInPicture = true
  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
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

/** Video capture tuned per orientation — soft ideals to avoid iOS crop. */
export function getVideoCaptureConstraints(
  orientation: RecordingOrientation = 'portrait',
): MediaTrackConstraints {
  return getVideoCaptureConstraintsForOrientation(orientation)
}

export function getAudioCaptureConstraints(): MediaTrackConstraints {
  return getMusicRecordingAudioConstraints()
}

export function estimateVideoBitrate(width: number, height: number): number {
  const pixels = width * height
  if (pixels >= 1920 * 1080) return 14_000_000
  if (pixels >= 1280 * 720) return 10_000_000
  if (pixels >= 960 * 540) return 7_000_000
  return 4_500_000
}

export function createMediaRecorder(
  stream: MediaStream,
  mimeType: string,
): MediaRecorder {
  const isVideo = !isAudioMimeType(mimeType)
  const isIOSNative =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'

  if (!isVideo) {
    const audioOptions: MediaRecorderOptions = isIOSNative
      ? { mimeType }
      : {
          mimeType,
          audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
        }
    try {
      return new MediaRecorder(stream, audioOptions)
    } catch {
      return new MediaRecorder(stream, { mimeType })
    }
  }

  // Let iOS pick encoder bitrates — custom targets can stall preview and drift A/V.
  if (isIOSNative) {
    try {
      return new MediaRecorder(stream, { mimeType })
    } catch {
      return new MediaRecorder(stream)
    }
  }

  const track = stream.getVideoTracks()[0]
  const settings = track?.getSettings()
  const width = settings?.width ?? 1280
  const height = settings?.height ?? 720

  const qualityOptions: MediaRecorderOptions = {
    mimeType,
    videoBitsPerSecond: estimateVideoBitrate(width, height),
    audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
  }

  try {
    return new MediaRecorder(stream, qualityOptions)
  } catch {
    try {
      return new MediaRecorder(stream, { mimeType, audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND })
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
