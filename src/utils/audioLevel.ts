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
