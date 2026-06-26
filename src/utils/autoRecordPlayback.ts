/** Hands-free capture: keep this much audio before the performance gate. */
export const AUTO_RECORD_PREROLL_MS = 1000

/** Discard idle pre-roll captures longer than this (no performance detected). */
export const AUTO_RECORD_MAX_IDLE_PREROLL_MS = 20_000

/** Auto-playback: begin this many seconds before the first detected attack. */
export const AUTO_PLAYBACK_LEAD_IN_S = 1

const ANALYSIS_WINDOW_S = 0.02
const ONSET_RMS_DB = -42
const ONSET_PEAK_DB = -36

function linearToDb(value: number): number {
  return 20 * Math.log10(Math.max(value, 1e-8))
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
      if (linearToDb(rms) >= ONSET_RMS_DB || linearToDb(peak) >= ONSET_PEAK_DB) {
        const onsetSeconds = offset / sampleRate
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
): Promise<void> {
  const start = await findAutoPlaybackLeadInStartSeconds(media, leadInSeconds)
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
