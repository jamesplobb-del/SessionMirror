import Foundation

/// 1:1 port of `src/multitrack/synchronization/autoAlign.ts`.
enum TakeAlignmentEngine {
    private static let envelopeHz = 2_000.0
    private static let confidenceThreshold = 1.8

    struct Result {
        let refinedOffsetMs: Int
        let residualMs: Int
        let confidence: Double
        let applied: Bool
    }

    struct PracticeAnalysis {
        let performanceStartSeconds: Double?
        let leadInMs: Int
        let pitchSeries: [[String: Double]]
    }

    /// Finds the first sustained musical energy and keeps 500 ms of breath/bow/tongue
    /// context before it. It also samples a lightweight monophonic pitch contour for
    /// focused-practice A/B graphs.
    static func analyzePracticeTake(samples: [Float], sampleRate: Double) -> PracticeAnalysis {
        guard !samples.isEmpty, sampleRate > 0 else {
            return PracticeAnalysis(performanceStartSeconds: nil, leadInMs: 0, pitchSeries: [])
        }

        let windowSize = max(128, Int((sampleRate * 0.02).rounded()))
        var rmsWindows: [Double] = []
        var offset = 0
        while offset + windowSize <= samples.count {
            var sum = 0.0
            for index in offset..<(offset + windowSize) {
                let value = Double(samples[index])
                sum += value * value
            }
            rmsWindows.append(sqrt(sum / Double(windowSize)))
            offset += windowSize
        }

        let sortedRms = rmsWindows.sorted()
        let floorIndex = min(max(0, Int(Double(sortedRms.count) * 0.2)), max(0, sortedRms.count - 1))
        let noiseFloor = sortedRms.isEmpty ? 0 : sortedRms[floorIndex]
        let threshold = max(0.01, noiseFloor * 3.5)
        var onsetWindow: Int?
        if rmsWindows.count >= 3 {
            for index in 0..<(rmsWindows.count - 2) {
                if rmsWindows[index] >= threshold &&
                    rmsWindows[index + 1] >= threshold &&
                    rmsWindows[index + 2] >= threshold {
                    onsetWindow = index
                    break
                }
            }
        }

        let onsetSeconds = onsetWindow.map { Double($0 * windowSize) / sampleRate }
        let leadInMs = Int((max(0, (onsetSeconds ?? 0) - 0.5) * 1_000).rounded())
        let pitch = pitchContour(samples: samples, sampleRate: sampleRate)
        return PracticeAnalysis(
            performanceStartSeconds: onsetSeconds,
            leadInMs: leadInMs,
            pitchSeries: pitch
        )
    }

    private static func pitchContour(samples: [Float], sampleRate: Double) -> [[String: Double]] {
        // Downsample before autocorrelation. The contour needs musical accuracy,
        // not mastering resolution, and this keeps minute-long takes inexpensive.
        let decimation = max(1, Int((sampleRate / 8_000.0).rounded()))
        let contourSamples: [Float]
        if decimation > 1 {
            contourSamples = stride(from: 0, to: samples.count, by: decimation).map { samples[$0] }
        } else {
            contourSamples = samples
        }
        let contourRate = sampleRate / Double(decimation)
        let frameSize = 1024
        guard contourSamples.count >= frameSize else { return [] }
        let hop = max(1, Int((contourRate * 0.1).rounded()))
        let minLag = max(2, Int(contourRate / 1_600.0))
        let maxLag = min(frameSize - 2, Int(contourRate / 55.0))
        guard maxLag > minLag else { return [] }

        var series: [[String: Double]] = []
        var start = 0
        while start + frameSize <= contourSamples.count && series.count < 1_200 {
            var mean = 0.0
            var energy = 0.0
            for index in 0..<frameSize {
                mean += Double(contourSamples[start + index])
            }
            mean /= Double(frameSize)
            for index in 0..<frameSize {
                let value = Double(contourSamples[start + index]) - mean
                energy += value * value
            }
            let rms = sqrt(energy / Double(frameSize))

            if rms >= 0.008 {
                var bestLag = 0
                var bestCorrelation = 0.0
                for lag in minLag...maxLag {
                    var numerator = 0.0
                    var leftEnergy = 0.0
                    var rightEnergy = 0.0
                    let count = frameSize - lag
                    for index in 0..<count {
                        let left = Double(contourSamples[start + index]) - mean
                        let right = Double(contourSamples[start + index + lag]) - mean
                        numerator += left * right
                        leftEnergy += left * left
                        rightEnergy += right * right
                    }
                    let denominator = sqrt(leftEnergy * rightEnergy)
                    let correlation = denominator > 0 ? numerator / denominator : 0
                    if correlation > bestCorrelation {
                        bestCorrelation = correlation
                        bestLag = lag
                    }
                }

                if bestLag > 0 && bestCorrelation >= 0.72 {
                    let frequency = contourRate / Double(bestLag)
                    series.append([
                        "time": Double(start + frameSize / 2) / contourRate,
                        "frequencyHz": frequency,
                    ])
                }
            }
            start += hop
        }
        return series
    }

    static func compute(
        samples: [Float],
        sampleRate: Double,
        bpm: Double,
        countInBeats: Int,
        deterministicOffsetMs: Double,
        searchMs: Double = 250
    ) -> Result {
        let fallback = Result(
            refinedOffsetMs: Int(deterministicOffsetMs.rounded()),
            residualMs: 0,
            confidence: 0,
            applied: false
        )

        guard countInBeats >= 2, bpm > 0, !samples.isEmpty, sampleRate > 0 else {
            return fallback
        }

        let env = onsetEnvelope(samples: samples, sampleRate: sampleRate)
        guard !env.isEmpty else { return fallback }

        let framesPerMs = envelopeHz / 1_000.0
        let beatFrames = (60_000.0 / bpm) * framesPerMs
        let centreFrames = deterministicOffsetMs * framesPerMs
        let windowFrames = Int((searchMs * framesPerMs).rounded())

        var bestLag = centreFrames
        var bestScore = -1.0
        var runnerUp = 0.0
        let startLag = Int((centreFrames - Double(windowFrames)).rounded())
        let endLag = Int((centreFrames + Double(windowFrames)).rounded())

        for lag in startLag...endLag {
            let score = gridScore(env: env, lagFrames: Double(lag), beatFrames: beatFrames, countInBeats: countInBeats)
            if score > bestScore {
                runnerUp = bestScore
                bestScore = score
                bestLag = Double(lag)
            } else if score > runnerUp {
                runnerUp = score
            }
        }

        let confidence: Double
        if runnerUp > 0 {
            confidence = bestScore / runnerUp
        } else if bestScore > 0 {
            confidence = .infinity
        } else {
            confidence = 0
        }

        let refinedOffsetMs = Int((bestLag / framesPerMs).rounded())
        let residualMs = refinedOffsetMs - Int(deterministicOffsetMs.rounded())

        guard confidence >= confidenceThreshold else {
            return Result(
                refinedOffsetMs: fallback.refinedOffsetMs,
                residualMs: 0,
                confidence: confidence.isFinite ? confidence : 0,
                applied: false
            )
        }

        return Result(
            refinedOffsetMs: refinedOffsetMs,
            residualMs: residualMs,
            confidence: confidence,
            applied: true
        )
    }

    /// Waveform peaks matching `useMediaWaveform.ts` `buildPeaks` (power 0.72).
    static func extractWaveformPeaks(samples: [Float], barCount: Int) -> [Double] {
        let count = max(1, barCount)
        let length = samples.count
        let samplesPerBar = max(1, length / count)
        var peaks: [Double] = []
        peaks.reserveCapacity(count)

        for bar in 0..<count {
            let start = bar * samplesPerBar
            let end = bar == count - 1 ? length : min(length, start + samplesPerBar)
            var sum = 0.0
            var n = 0
            var i = start
            while i < end {
                sum += abs(Double(samples[i]))
                n += 1
                i += 32
            }
            peaks.append(n > 0 ? sum / Double(n) : 0)
        }

        let maxPeak = max(peaks.max() ?? 0.001, 0.001)
        return peaks.map { peak in
            let normalized = peak / maxPeak
            return max(0.08, min(1.0, pow(normalized, 0.72)))
        }
    }

    private static func onsetEnvelope(samples: [Float], sampleRate: Double) -> [Double] {
        let hop = max(1, Int((sampleRate / envelopeHz).rounded()))
        let outLen = samples.count / hop
        guard outLen > 0 else { return [] }

        var env = [Double](repeating: 0, count: outLen)
        var prev = 0.0
        for i in 0..<outLen {
            var acc = 0.0
            let base = i * hop
            for j in 0..<hop {
                let idx = base + j
                if idx >= samples.count { break }
                let s = Double(samples[idx])
                let d = s - prev
                prev = s
                if d > 0 { acc += d * d }
            }
            env[i] = sqrt(acc / Double(hop))
        }

        let maxVal = env.max() ?? 0
        if maxVal > 0 {
            for i in 0..<env.count { env[i] /= maxVal }
        }
        return env
    }

    private static func gridScore(
        env: [Double],
        lagFrames: Double,
        beatFrames: Double,
        countInBeats: Int
    ) -> Double {
        var score = 0.0
        for k in 0..<countInBeats {
            let centre = Int((lagFrames + Double(k) * beatFrames).rounded())
            if centre < 0 || centre >= env.count { continue }
            var best = 0.0
            for w in -2...2 {
                let idx = centre + w
                if idx >= 0 && idx < env.count && env[idx] > best {
                    best = env[idx]
                }
            }
            score += best
        }
        return score
    }
}
