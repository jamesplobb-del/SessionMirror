/** Hands-free capture: keep this much audio before the performance gate. */
export const AUTO_RECORD_PREROLL_MS = 1000

/** Discard idle pre-roll captures longer than this (no performance detected). */
export const AUTO_RECORD_MAX_IDLE_PREROLL_MS = 20_000

/** Auto-playback: begin this many seconds before the first detected attack. */
export const AUTO_PLAYBACK_LEAD_IN_S = 1

const AUTO_PLAYBACK_TAIL_SKIP_POLL_MS = 50
const MIN_AUTO_PLAYBACK_AUDIBLE_S = 0.25
const ANALYSIS_WINDOW_S = 0.02
const BASELINE_WINDOW_S = 0.75
const MIN_ONSET_RMS_DB = -32
const MIN_ONSET_PEAK_DB = -24
const RMS_HEADROOM_DB = 20
const PEAK_HEADROOM_DB = 24
const RMS_CONTENT_DROP_DB = 10
const PEAK_CONTENT_DROP_DB = 12
const CONSECUTIVE_RMS_WINDOWS = 3

function linearToDb(value: number): number {
  return 20 * Math.log10(Math.max(value, 1e-8))
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return -96
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return sorted[index] ?? -96
}

/**
 * Find where audible content begins, then return a start time ~1s earlier so the
 * attack is not clipped on speaker playback.
 */
export async function findAutoPlaybackLeadInStartSeconds(
  media: HTMLMediaElement,
  leadInSeconds = AUTO_PLAYBACK_LEAD_IN_S,
): Promise<number> {
  const src = media.currentSrc || media.src
  if (!src) return 0

  let ctx: AudioContext | null = null
  try {
    ctx = new AudioContext()
    const response = await fetch(src)
    if (!response.ok) return 0
    const arrayBuffer = await response.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const sampleRate = buffer.sampleRate
    const windowSamples = Math.max(1, Math.floor(sampleRate * ANALYSIS_WINDOW_S))
    const channelCount = buffer.numberOfChannels
    const totalSamples = buffer.length
    const windows: Array<{ offset: number; rmsDb: number; peakDb: number }> = []

    for (let offset = 0; offset < totalSamples; offset += windowSamples) {
      let peak = 0
      let sumSq = 0
      let count = 0
      const end = Math.min(totalSamples, offset + windowSamples)

      for (let ch = 0; ch < channelCount; ch++) {
        const data = buffer.getChannelData(ch)
        for (let i = offset; i < end; i++) {
          const sample = data[i] ?? 0
          const abs = Math.abs(sample)
          if (abs > peak) peak = abs
          sumSq += sample * sample
          count++
        }
      }

      const rms = Math.sqrt(sumSq / Math.max(1, count))
      windows.push({
        offset,
        rmsDb: linearToDb(rms),
        peakDb: linearToDb(peak),
      })
    }

    if (windows.length === 0) {
      return 0
    }

    const baselineWindowCount = Math.max(
      1,
      Math.floor(BASELINE_WINDOW_S / ANALYSIS_WINDOW_S),
    )
    const baseline = windows.slice(0, baselineWindowCount)
    const baselineRms = baseline.map((window) => window.rmsDb).sort((a, b) => a - b)
    const baselinePeak = baseline.map((window) => window.peakDb).sort((a, b) => a - b)
    const contentRms = windows.map((window) => window.rmsDb).sort((a, b) => a - b)
    const contentPeak = windows.map((window) => window.peakDb).sort((a, b) => a - b)
    const rmsThreshold = Math.max(
      MIN_ONSET_RMS_DB,
      percentile(baselineRms, 0.75) + RMS_HEADROOM_DB,
      percentile(contentRms, 0.95) - RMS_CONTENT_DROP_DB,
    )
    const peakThreshold = Math.max(
      MIN_ONSET_PEAK_DB,
      percentile(baselinePeak, 0.75) + PEAK_HEADROOM_DB,
      percentile(contentPeak, 0.95) - PEAK_CONTENT_DROP_DB,
    )

    let consecutiveRmsWindows = 0
    for (const window of windows) {
      if (window.rmsDb >= rmsThreshold) {
        consecutiveRmsWindows += 1
      } else {
        consecutiveRmsWindows = 0
      }

      const sustainedOnset = consecutiveRmsWindows >= CONSECUTIVE_RMS_WINDOWS
      const transientOnset =
        window.peakDb >= peakThreshold &&
        window.rmsDb >= rmsThreshold - 4

      if (sustainedOnset || transientOnset) {
        const correctedOffset = sustainedOnset
          ? Math.max(0, window.offset - (CONSECUTIVE_RMS_WINDOWS - 1) * windowSamples)
          : window.offset
        const onsetSeconds = correctedOffset / sampleRate
        return Math.max(0, onsetSeconds - leadInSeconds)
      }
    }

    return 0
  } catch {
    return 0
  } finally {
    if (ctx && ctx.state !== 'closed') {
      await ctx.close().catch(() => {})
    }
  }
}

export async function applyAutoPlaybackLeadIn(
  media: HTMLMediaElement,
  leadInSeconds = AUTO_PLAYBACK_LEAD_IN_S,
  performanceStartSeconds?: number,
): Promise<void> {
  const start =
    typeof performanceStartSeconds === 'number' &&
    Number.isFinite(performanceStartSeconds)
      ? Math.max(0, performanceStartSeconds - leadInSeconds)
      : await findAutoPlaybackLeadInStartSeconds(media, leadInSeconds)
  if (start <= 0.01) return

  const apply = () => {
    if (!Number.isFinite(media.duration) || media.duration <= 0) return
    media.currentTime = Math.min(start, Math.max(0, media.duration - 0.05))
  }

  if (media.readyState >= HTMLMediaElement.HAVE_METADATA) {
    apply()
    return
  }

  await new Promise<void>((resolve) => {
    const onMeta = () => {
      media.removeEventListener('loadedmetadata', onMeta)
      apply()
      resolve()
    }
    media.addEventListener('loadedmetadata', onMeta, { once: true })
  })
}

export function attachAutoPlaybackTailSkip(
  media: HTMLMediaElement,
  trailingSilenceSeconds: number,
  onTailReached: () => void,
): () => void {
  const skipSeconds = Math.max(0, trailingSilenceSeconds)
  if (skipSeconds <= 0.05) return () => {}

  let stopped = false
  let intervalId: number | null = null
  const startedAt = Math.max(0, media.currentTime || 0)

  const check = () => {
    if (stopped || media.paused || media.ended) return
    if (!Number.isFinite(media.duration) || media.duration <= 0) return

    const earliestEnd = startedAt + MIN_AUTO_PLAYBACK_AUDIBLE_S
    const skipEnd = media.duration - skipSeconds
    const endAt = Math.min(media.duration, Math.max(earliestEnd, skipEnd))
    if (media.currentTime < endAt) return

    stopped = true
    media.pause()
    onTailReached()
  }

  intervalId = window.setInterval(check, AUTO_PLAYBACK_TAIL_SKIP_POLL_MS)
  media.addEventListener('timeupdate', check)
  media.addEventListener('durationchange', check)

  return () => {
    stopped = true
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
    media.removeEventListener('timeupdate', check)
    media.removeEventListener('durationchange', check)
  }
}
