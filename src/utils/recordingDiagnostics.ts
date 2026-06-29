/**
 * Post-record loudness analysis and capture-path diagnostics.
 */

import type { CaptureProfile } from './audioCapture'

const MAX_ANALYSIS_SECONDS = 45

export interface RecordingTrackSnapshot {
  settings: MediaTrackSettings
  constraints: MediaTrackConstraints | undefined
}

export interface RecordingLevelAnalysis {
  recordedPeakDb: number
  recordedActiveRmsDb: number
  leftChannelRmsDb: number | null
  rightChannelRmsDb: number | null
  channelCount: number
}

export interface PlaybackGainMetadata {
  targetActiveRmsDb: number
  peakCeilingDb: number
  measuredActiveRmsDb: number
  measuredPeakDb: number
  /** Non-destructive playback boost suggestion (dB) — not applied unless enabled later. */
  suggestedGainDb: number
}

export interface RecordingCaptureDiagnostics {
  captureProfile: CaptureProfile
  trackSnapshot: RecordingTrackSnapshot | null
  levels: RecordingLevelAnalysis | null
  playbackGainMetadata: PlaybackGainMetadata | null
}

function linearToDb(value: number): number {
  return 20 * Math.log10(Math.max(value, 1e-8))
}

export function snapshotCaptureAudioTrack(
  track: MediaStreamTrack | null | undefined,
): RecordingTrackSnapshot | null {
  if (!track || track.readyState !== 'live') return null

  return {
    settings: { ...track.getSettings() },
    constraints: track.getConstraints(),
  }
}

function measureBufferLevels(buffer: AudioBuffer): RecordingLevelAnalysis {
  const channelCount = buffer.numberOfChannels
  const maxSamples = Math.min(
    buffer.length,
    Math.floor(buffer.sampleRate * MAX_ANALYSIS_SECONDS),
  )

  let globalPeak = 0
  const channelRms: number[] = []

  for (let ch = 0; ch < channelCount; ch++) {
    const data = buffer.getChannelData(ch)
    let peak = 0
    let sumSq = 0
    for (let i = 0; i < maxSamples; i++) {
      const sample = data[i] ?? 0
      const abs = Math.abs(sample)
      if (abs > peak) peak = abs
      sumSq += sample * sample
    }
    if (peak > globalPeak) globalPeak = peak
    channelRms.push(Math.sqrt(sumSq / Math.max(1, maxSamples)))
  }

  const activeGate = Math.max(globalPeak * 0.12, 1e-5)
  let activeSumSq = 0
  let activeCount = 0

  for (let ch = 0; ch < channelCount; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < maxSamples; i++) {
      const sample = data[i] ?? 0
      if (Math.abs(sample) >= activeGate) {
        activeSumSq += sample * sample
        activeCount++
      }
    }
  }

  const activeRms =
    activeCount > 0
      ? Math.sqrt(activeSumSq / activeCount)
      : Math.max(...channelRms, 1e-8)

  return {
    recordedPeakDb: linearToDb(globalPeak),
    recordedActiveRmsDb: linearToDb(activeRms),
    leftChannelRmsDb: channelCount >= 1 ? linearToDb(channelRms[0]!) : null,
    rightChannelRmsDb: channelCount >= 2 ? linearToDb(channelRms[1]!) : null,
    channelCount,
  }
}

async function decodeAudioSource(
  source: Blob | string,
  decodeContext?: AudioContext,
): Promise<AudioBuffer | null> {
  let ownsContext = false
  let ctx = decodeContext
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext()
    ownsContext = true
  }

  try {
    const arrayBuffer =
      typeof source === 'string'
        ? await (await fetch(source)).arrayBuffer()
        : await source.arrayBuffer()
    return await ctx.decodeAudioData(arrayBuffer.slice(0))
  } catch {
    return null
  } finally {
    if (ownsContext) {
      await ctx.close().catch(() => {})
    }
  }
}

export async function analyzeRecordingLevels(
  source: Blob | string,
  decodeContext?: AudioContext,
): Promise<RecordingLevelAnalysis | null> {
  const buffer = await decodeAudioSource(source, decodeContext)
  if (!buffer) return null
  return measureBufferLevels(buffer)
}

export function computePlaybackGainMetadata(
  analysis: RecordingLevelAnalysis,
  targetActiveRmsDb = -10,
  peakCeilingDb = -0.75,
): PlaybackGainMetadata {
  const rmsGainDb = targetActiveRmsDb - analysis.recordedActiveRmsDb
  const peakGainDb = peakCeilingDb - analysis.recordedPeakDb
  const suggestedGainDb = Math.min(13, Math.max(0, Math.min(rmsGainDb, peakGainDb)))

  return {
    targetActiveRmsDb,
    peakCeilingDb,
    measuredActiveRmsDb: analysis.recordedActiveRmsDb,
    measuredPeakDb: analysis.recordedPeakDb,
    suggestedGainDb,
  }
}

export function logRecordingCaptureDiagnostics(
  takeId: string,
  diagnostics: RecordingCaptureDiagnostics,
): void {
  const { trackSnapshot, levels, playbackGainMetadata, captureProfile } = diagnostics

  console.log('[RecordingCapture] saved take', takeId)
  console.log('captureProfile =', captureProfile)

  if (trackSnapshot) {
    console.log('mediaTrackSettings =', trackSnapshot.settings)
    console.log('mediaTrackConstraints =', trackSnapshot.constraints)
  }

  if (levels) {
    console.log('recordedPeakDb =', levels.recordedPeakDb.toFixed(1))
    console.log('recordedActiveRmsDb =', levels.recordedActiveRmsDb.toFixed(1))
    console.log('leftChannelRmsDb =', levels.leftChannelRmsDb?.toFixed(1) ?? 'n/a')
    console.log('rightChannelRmsDb =', levels.rightChannelRmsDb?.toFixed(1) ?? 'n/a')
    console.log('channelCount =', levels.channelCount)
  }

  if (playbackGainMetadata) {
    console.log('playbackGainMetadata =', playbackGainMetadata)
  }
}

export async function buildRecordingCaptureDiagnostics(
  captureProfile: CaptureProfile,
  trackSnapshot: RecordingTrackSnapshot | null,
  audioSource: Blob | string | null,
): Promise<RecordingCaptureDiagnostics> {
  const levels = audioSource ? await analyzeRecordingLevels(audioSource) : null
  const playbackGainMetadata = levels ? computePlaybackGainMetadata(levels) : null

  return {
    captureProfile,
    trackSnapshot,
    levels,
    playbackGainMetadata,
  }
}
