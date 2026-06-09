export interface AnalyserMetrics {
  rms: number
  peak: number
}

/** Single-pass RMS + peak read — reuses buffer to avoid per-tick allocations. */
export function readAnalyserMetrics(
  analyser: AnalyserNode,
  buffer: Float32Array,
): AnalyserMetrics {
  analyser.getFloatTimeDomainData(buffer)

  let sum = 0
  let peak = 0
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = buffer[index]
    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
    sum += sample * sample
  }

  return { rms: Math.sqrt(sum / buffer.length), peak }
}

/** Combined level for sensitive gates — peak weighted for sharp attacks. */
export function combinedGateLevel(metrics: AnalyserMetrics, peakWeight = 0.45): number {
  return Math.max(metrics.rms, metrics.peak * peakWeight)
}

/** Root-mean-square level from time-domain analyser samples (0–~0.3 typical speech). */
export function readAnalyserRms(analyser: AnalyserNode): number {
  const buffer = new Float32Array(analyser.fftSize)
  return readAnalyserMetrics(analyser, buffer).rms
}

/** Peak amplitude in the current analyser buffer. */
export function readAnalyserPeak(analyser: AnalyserNode): number {
  const buffer = new Float32Array(analyser.fftSize)
  return readAnalyserMetrics(analyser, buffer).peak
}

/** Combined level for auto-record gates. */
export function readAnalyserLevel(analyser: AnalyserNode): number {
  const buffer = new Float32Array(analyser.fftSize)
  return combinedGateLevel(readAnalyserMetrics(analyser, buffer))
}
