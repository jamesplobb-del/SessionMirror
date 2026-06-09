import { PitchDetector } from 'pitchy'
import type { PitchSample } from '../types'
import { resolveNativeVideoPlaybackSrc } from './takeStorage'

const FRAME_SIZE = 4096
const HOP_SIZE = 512
const MIN_FREQ_HZ = 65
const MAX_FREQ_HZ = 1760
const MIN_CLARITY = 0.86
const MEDIAN_WINDOW = 5

export interface WaveformSample {
  time: number
  amplitude: number
}

export interface TakePitchAnalysis {
  pitchSeries: PitchSample[]
  waveform: WaveformSample[]
  durationSec: number
}

const analysisCache = new Map<string, TakePitchAnalysis>()

function cacheKey(takeId: string, filePath: string, videoUrl: string): string {
  return `${takeId}:${filePath || videoUrl}`
}

function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const { length, numberOfChannels } = audioBuffer
  const mono = new Float32Array(length)

  if (numberOfChannels === 1) {
    mono.set(audioBuffer.getChannelData(0))
    return mono
  }

  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const channelData = audioBuffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) {
      mono[index] += channelData[index] / numberOfChannels
    }
  }

  return mono
}

function frameRms(samples: Float32Array, start: number, length: number): number {
  let sum = 0
  const end = Math.min(start + length, samples.length)
  for (let index = start; index < end; index += 1) {
    sum += samples[index] * samples[index]
  }
  return Math.sqrt(sum / Math.max(end - start, 1))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function smoothPitchSeries(raw: PitchSample[]): PitchSample[] {
  if (raw.length === 0) return []

  const smoothed: PitchSample[] = []
  const half = Math.floor(MEDIAN_WINDOW / 2)

  for (let index = 0; index < raw.length; index += 1) {
    const window: number[] = []
    for (let offset = -half; offset <= half; offset += 1) {
      const sample = raw[index + offset]
      if (sample) window.push(sample.frequencyHz)
    }
    smoothed.push({
      time: raw[index].time,
      frequencyHz: median(window),
    })
  }

  return smoothed
}

export async function decodeTakeAudio(
  filePath: string,
  videoUrl: string,
): Promise<AudioBuffer> {
  const src = await resolveNativeVideoPlaybackSrc(filePath, videoUrl)
  if (!src) {
    throw new Error('Unable to resolve take audio source')
  }

  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(`Failed to load take audio (${response.status})`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const context = new AudioContext()

  try {
    return await context.decodeAudioData(arrayBuffer.slice(0))
  } finally {
    await context.close()
  }
}

export function analyzeAudioBuffer(
  audioBuffer: AudioBuffer,
  onProgress?: (progress: number) => void,
): TakePitchAnalysis {
  const mono = mixToMono(audioBuffer)
  const sampleRate = audioBuffer.sampleRate
  const detector = PitchDetector.forFloat32Array(FRAME_SIZE)
  detector.clarityThreshold = MIN_CLARITY
  detector.minVolumeDecibels = -48

  const pitchSeries: PitchSample[] = []
  const waveform: WaveformSample[] = []
  const totalFrames = Math.max(
    1,
    Math.floor((mono.length - FRAME_SIZE) / HOP_SIZE),
  )

  let peakRms = 0

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const start = frame * HOP_SIZE
    const frameSamples = mono.subarray(start, start + FRAME_SIZE)
    const time = start / sampleRate
    const rms = frameRms(mono, start, FRAME_SIZE)
    peakRms = Math.max(peakRms, rms)

    waveform.push({ time, amplitude: rms })

    const [pitch, clarity] = detector.findPitch(frameSamples, sampleRate)
    if (
      clarity >= MIN_CLARITY &&
      pitch >= MIN_FREQ_HZ &&
      pitch <= MAX_FREQ_HZ
    ) {
      pitchSeries.push({ time: Number(time.toFixed(3)), frequencyHz: pitch })
    }

    if (frame % 32 === 0) {
      onProgress?.(Math.min(1, frame / totalFrames))
    }
  }

  onProgress?.(1)

  const normalizedWaveform = waveform.map((sample) => ({
    time: sample.time,
    amplitude: peakRms > 0 ? sample.amplitude / peakRms : 0,
  }))

  return {
    pitchSeries: smoothPitchSeries(pitchSeries),
    waveform: normalizedWaveform,
    durationSec: audioBuffer.duration,
  }
}

export async function analyzeTakePitch(
  takeId: string,
  filePath: string,
  videoUrl: string,
  onProgress?: (progress: number) => void,
): Promise<TakePitchAnalysis> {
  const key = cacheKey(takeId, filePath, videoUrl)
  const cached = analysisCache.get(key)
  if (cached) {
    onProgress?.(1)
    return cached
  }

  const audioBuffer = await decodeTakeAudio(filePath, videoUrl)
  const analysis = analyzeAudioBuffer(audioBuffer, onProgress)
  analysisCache.set(key, analysis)
  return analysis
}

export function clearPitchAnalysisCache(): void {
  analysisCache.clear()
}
