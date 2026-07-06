/**
 * Targeted diagnostics for Audio Mode silent-playback investigation.
 * Enable with: localStorage.setItem('sessionmirror:audio-playback-diag', '1')
 */

import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { nativeDataFileExists } from './filesystemInit'
import BestTakeAudioPlugin from './audioSessionRoute'
import { analyzeRecordingLevels } from './recordingDiagnostics'

const LOG = '[AudioPlaybackDiag]'

let sessionCounter = 0
let activeDiagSessionId: string | null = null

export function setActivePlaybackDiagSession(sessionId: string | null): void {
  activeDiagSessionId = sessionId
}

export function getActivePlaybackDiagSession(): string | null {
  return activeDiagSessionId
}

export function isAudioPlaybackDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem('sessionmirror:audio-playback-diag') === '1'
  } catch {
    return false
  }
}

export function createPlaybackDiagSession(label: string): string {
  sessionCounter += 1
  const id = `pb-${sessionCounter}-${Date.now()}`
  if (!isAudioPlaybackDiagnosticsEnabled()) return id
  console.info(LOG, 'session-start', { sessionId: id, label })
  return id
}

export function snapshotPlaybackMedia(
  media: HTMLMediaElement | null | undefined,
): Record<string, unknown> {
  return mediaSnapshot(media)
}

function diagLog(phase: string, details: Record<string, unknown>): void {
  if (!isAudioPlaybackDiagnosticsEnabled()) return
  console.info(LOG, phase, details)
}

function mediaSnapshot(media: HTMLMediaElement | null | undefined): Record<string, unknown> {
  if (!media) return { media: null }
  return {
    src: media.src || media.currentSrc || '',
    currentTime: media.currentTime,
    duration: Number.isFinite(media.duration) ? media.duration : null,
    readyState: media.readyState,
    networkState: media.networkState,
    paused: media.paused,
    ended: media.ended,
    muted: media.muted,
    volume: media.volume,
    error: media.error
      ? { code: media.error.code, message: media.error.message }
      : null,
  }
}

/** Step 1 — verify recording output immediately after save. */
export async function logRecordingOutputVerification(details: {
  takeId: string
  filePath: string
  mimeType: string
  durationSeconds: number
  videoUrl: string
  mediaType: 'video' | 'audio'
}): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {
    step: 'recording-output',
    takeId: details.takeId,
    filePath: details.filePath,
    mimeType: details.mimeType,
    durationSeconds: details.durationSeconds,
    mediaType: details.mediaType,
    videoUrl: details.videoUrl,
    platform: Capacitor.getPlatform(),
  }

  if (Capacitor.isNativePlatform() && details.filePath) {
    const exists = await nativeDataFileExists(details.filePath)
    report.fileExists = exists

    if (exists) {
      try {
        const stat = await Filesystem.stat({
          path: details.filePath,
          directory: Directory.Data,
        })
        report.fileSizeBytes = stat.size
      } catch (error) {
        report.fileStatError = error instanceof Error ? error.message : String(error)
      }
    }
  } else if (details.videoUrl.startsWith('blob:')) {
    report.fileExists = true
    report.sourceKind = 'blob'
  }

  diagLog('step-1-recording-output', report)
  return report
}

/** Step 2 — verify playback source before player creation. */
export async function logPlaybackSourceVerification(details: {
  sessionId: string
  requestedTakeId: string
  filePath: string
  requestedUrl: string
  resolvedUrl: string
  newestTakeId?: string | null
  previousAutoPlaybackTakeId?: string | null
  queuedTakeId?: string | null
}): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {
    step: 'playback-source',
    sessionId: details.sessionId,
    requestedTakeId: details.requestedTakeId,
    filePath: details.filePath,
    requestedUrl: details.requestedUrl,
    resolvedUrl: details.resolvedUrl,
    isNewestTake: details.newestTakeId ? details.requestedTakeId === details.newestTakeId : null,
    newestTakeId: details.newestTakeId ?? null,
    previousAutoPlaybackTakeId: details.previousAutoPlaybackTakeId ?? null,
    queuedTakeId: details.queuedTakeId ?? null,
    urlsMatch: details.requestedUrl === details.resolvedUrl,
  }

  if (Capacitor.isNativePlatform() && details.filePath) {
    report.fileExists = await nativeDataFileExists(details.filePath)
  }

  if (details.filePath && details.previousAutoPlaybackTakeId) {
    report.possibleStaleReference =
      details.filePath.includes(details.previousAutoPlaybackTakeId) &&
      details.requestedTakeId !== details.previousAutoPlaybackTakeId
  }

  diagLog('step-2-playback-source', report)
  return report
}

/** Step 3 — attach playback pipeline state transition listeners. */
export function attachPlaybackPipelineInstrumentation(
  media: HTMLMediaElement,
  context: { sessionId: string; takeId: string; path: string },
): () => void {
  if (!isAudioPlaybackDiagnosticsEnabled()) return () => {}

  const logEvent = (event: string, extra: Record<string, unknown> = {}) => {
    diagLog('step-3-playback-event', {
      sessionId: context.sessionId,
      takeId: context.takeId,
      path: context.path,
      event,
      ...mediaSnapshot(media),
      ...extra,
    })
  }

  logEvent('instrumentation-attached')

  const handlers: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [
    ['loadstart', () => logEvent('loadstart')],
    ['loadedmetadata', () => logEvent('loadedmetadata')],
    ['loadeddata', () => logEvent('loadeddata')],
    ['canplay', () => logEvent('canplay')],
    ['canplaythrough', () => logEvent('canplaythrough')],
    ['play', () => logEvent('playing')],
    ['playing', () => logEvent('playing-fired')],
    ['pause', () => logEvent('pause')],
    ['ended', () => logEvent('ended')],
    ['error', () => logEvent('error')],
    ['stalled', () => logEvent('stalled')],
    ['waiting', () => logEvent('waiting')],
    ['timeupdate', () => {
      if (media.currentTime > 0.05 && media.currentTime < 0.15) {
        logEvent('first-timeupdate', { currentTime: media.currentTime })
      }
    }],
  ]

  for (const [event, handler] of handlers) {
    media.addEventListener(event, handler)
  }

  return () => {
    for (const [event, handler] of handlers) {
      media.removeEventListener(event, handler)
    }
    logEvent('instrumentation-detached')
  }
}

/** Step 4 — snapshot AVAudioSession state from native bridge. */
export async function logAudioSessionSnapshot(
  phase: string,
  sessionId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  if (!isAudioPlaybackDiagnosticsEnabled() || !Capacitor.isNativePlatform()) return

  try {
    const [route, cameraState] = await Promise.all([
      BestTakeAudioPlugin.getPlaybackOutputProfile(),
      BestTakeAudioPlugin.getCameraSessionState(),
    ])
    diagLog('step-4-audio-session', {
      phase,
      sessionId,
      route,
      cameraState,
      ...extra,
    })
  } catch (error) {
    diagLog('step-4-audio-session-error', {
      phase,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      ...extra,
    })
  }
}

/** Step 5 — trace route-switching handoffs. */
export function logRouteTransition(
  sessionId: string,
  phase: string,
  details: Record<string, unknown> = {},
): void {
  diagLog('step-5-route-transition', { sessionId, phase, ...details })
}

/** Step 6 — verify recorded file contains audible audio data. */
export async function logAudioFileContentVerification(details: {
  sessionId: string
  takeId: string
  filePath: string
  playbackUrl: string
  durationSeconds: number
}): Promise<Record<string, unknown>> {
  const report: Record<string, unknown> = {
    step: 'audio-content',
    sessionId: details.sessionId,
    takeId: details.takeId,
    filePath: details.filePath,
    playbackUrl: details.playbackUrl,
    expectedDurationSeconds: details.durationSeconds,
  }

  let analysisSource: string | null = null
  if (details.playbackUrl) {
    analysisSource = details.playbackUrl
  } else if (Capacitor.isNativePlatform() && details.filePath) {
    try {
      const { uri } = await Filesystem.getUri({
        path: details.filePath,
        directory: Directory.Data,
      })
      analysisSource = uri
    } catch {
      analysisSource = null
    }
  }

  if (analysisSource) {
    const levels = await analyzeRecordingLevels(analysisSource)
    report.levels = levels
    report.hasAudibleContent =
      levels !== null &&
      (levels.recordedPeakDb > -60 || levels.recordedActiveRmsDb > -70)
  } else {
    report.hasAudibleContent = null
    report.analysisSkipped = 'no-analysis-source'
  }

  diagLog('step-6-audio-content', report)
  return report
}
