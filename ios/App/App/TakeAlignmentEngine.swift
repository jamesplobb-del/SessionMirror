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
