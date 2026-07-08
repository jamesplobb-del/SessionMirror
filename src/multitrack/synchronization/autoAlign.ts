import { getPlaybackAudioContext } from '../../utils/playbackAudioContext'

/**
 * Automatic content alignment (Layer 2 latency compensation).
 *
 * Deterministic compensation (rawOffset − hardware round-trip latency) removes
 * the bulk of the capture skew, but leaves a residual that varies per take. This
 * module recovers that residual automatically — the musician never drags a clip.
 *
 * How: the metronome count-in is recorded into every take (the file is saved
 * un-trimmed, clicks near t=0). Clicks are sharp broadband transients — the
 * ideal correlation anchor. We build an onset envelope of the recording and
 * cross-correlate it against the *ideal* click grid (beat spacing = 60/bpm),
 * centred on the deterministic estimate. The lag of the correlation peak is the
 * true offset between record-start and the musical grid. A confidence gate
 * (peak vs. runner-up) means a weak/ambiguous match is discarded and the
 * deterministic estimate is kept — a bad auto-correction is worse than none.
 */

export interface AlignmentInput {
  mediaUrl: string
  bpm: number
  countInBeats: number
  /** Deterministic estimate (take.timelineOffsetMs) the search is centred on. */
  deterministicOffsetMs: number
  /** ± search window around the deterministic estimate. Default 250 ms. */
  searchMs?: number
}

export interface AlignmentResult {
  refinedOffsetMs: number
  residualMs: number
  confidence: number
  applied: boolean
}

/** Envelope resolution — 2 kHz (0.5 ms hop) is ample for click onsets and cheap. */
const ENVELOPE_HZ = 2000
/** Minimum peak-to-runner-up ratio to trust the correlation. */
const CONFIDENCE_THRESHOLD = 1.8

function toMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  const mono = new Float32Array(length)
  for (let c = 0; c < channels; c += 1) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i += 1) mono[i] += data[i]
  }
  if (channels > 1) {
    for (let i = 0; i < length; i += 1) mono[i] /= channels
  }
  return mono
}

/**
 * Onset envelope: first-difference high-pass (emphasises transients over
 * sustained tones), rectified, then bucketed to ENVELOPE_HZ. Positive-going
 * energy only — that's where a click's attack lives.
 */
function onsetEnvelope(mono: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.max(1, Math.round(sampleRate / ENVELOPE_HZ))
  const outLen = Math.floor(mono.length / hop)
  const env = new Float32Array(outLen)
  let prev = 0
  for (let i = 0; i < outLen; i += 1) {
    let acc = 0
    const base = i * hop
    for (let j = 0; j < hop; j += 1) {
      const s = mono[base + j]
      const d = s - prev
      prev = s
      if (d > 0) acc += d * d
    }
    env[i] = Math.sqrt(acc / hop)
  }
  // Normalise so confidence is amplitude-independent.
  let max = 0
  for (let i = 0; i < outLen; i += 1) if (env[i] > max) max = env[i]
  if (max > 0) {
    for (let i = 0; i < outLen; i += 1) env[i] /= max
  }
  return env
}

/** Correlation score of the click grid placed at `lagFrames` into the envelope. */
function gridScore(
  env: Float32Array,
  lagFrames: number,
  beatFrames: number,
  countInBeats: number,
): number {
  let score = 0
  for (let k = 0; k < countInBeats; k += 1) {
    const centre = Math.round(lagFrames + k * beatFrames)
    if (centre < 0 || centre >= env.length) continue
    // Small window around each expected click to tolerate sub-hop jitter.
    let best = 0
    for (let w = -2; w <= 2; w += 1) {
      const idx = centre + w
      if (idx >= 0 && idx < env.length && env[idx] > best) best = env[idx]
    }
    score += best
  }
  return score
}

export async function computeAlignment(input: AlignmentInput): Promise<AlignmentResult> {
  const { mediaUrl, bpm, countInBeats, deterministicOffsetMs } = input
  const searchMs = input.searchMs ?? 250

  const fallback: AlignmentResult = {
    refinedOffsetMs: deterministicOffsetMs,
    residualMs: 0,
    confidence: 0,
    applied: false,
  }

  if (countInBeats < 2 || bpm <= 0) return fallback

  let buffer: AudioBuffer
  try {
    const ctx = await getPlaybackAudioContext()
    const response = await fetch(mediaUrl)
    const encoded = await response.arrayBuffer()
    buffer = await ctx.decodeAudioData(encoded.slice(0))
  } catch {
    // Undecodable (e.g. codec/route issue) — keep deterministic estimate.
    return fallback
  }

  const sampleRate = buffer.sampleRate
  const mono = toMono(buffer)
  const env = onsetEnvelope(mono, sampleRate)
  if (env.length === 0) return fallback

  const framesPerMs = ENVELOPE_HZ / 1000
  const beatFrames = (60_000 / bpm) * framesPerMs
  const centreFrames = deterministicOffsetMs * framesPerMs
  const windowFrames = Math.round(searchMs * framesPerMs)

  let bestLag = centreFrames
  let bestScore = -1
  let runnerUp = 0
  for (let lag = centreFrames - windowFrames; lag <= centreFrames + windowFrames; lag += 1) {
    const score = gridScore(env, lag, beatFrames, countInBeats)
    if (score > bestScore) {
      runnerUp = bestScore
      bestScore = score
      bestLag = lag
    } else if (score > runnerUp) {
      runnerUp = score
    }
  }

  const confidence = runnerUp > 0 ? bestScore / runnerUp : bestScore > 0 ? Infinity : 0
  const refinedOffsetMs = Math.round(bestLag / framesPerMs)
  const residualMs = refinedOffsetMs - Math.round(deterministicOffsetMs)

  if (!Number.isFinite(refinedOffsetMs) || confidence < CONFIDENCE_THRESHOLD) {
    return { ...fallback, confidence: Number.isFinite(confidence) ? confidence : 0 }
  }

  return { refinedOffsetMs, residualMs, confidence, applied: true }
}
