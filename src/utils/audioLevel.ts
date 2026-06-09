/** Root-mean-square level from time-domain analyser samples (0–~0.3 typical speech). */
export function readAnalyserRms(analyser: AnalyserNode): number {
  const samples = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(samples)

  let sum = 0
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    sum += sample * sample
  }

  return Math.sqrt(sum / samples.length)
}

/** Peak amplitude in the current analyser buffer — catches trumpet/brass transients RMS misses. */
export function readAnalyserPeak(analyser: AnalyserNode): number {
  const samples = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(samples)

  let peak = 0
  for (let index = 0; index < samples.length; index += 1) {
    peak = Math.max(peak, Math.abs(samples[index]))
  }

  return peak
}

/** Combined level for auto-record gates — responsive to both sustained and sharp attacks. */
export function readAnalyserLevel(analyser: AnalyserNode): number {
  const rms = readAnalyserRms(analyser)
  const peak = readAnalyserPeak(analyser)
  return Math.max(rms, peak * 0.45)
}
