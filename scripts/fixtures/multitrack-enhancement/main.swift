import AVFoundation
import Foundation

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let rate = 48000.0
var seed: UInt64 = 12345
func random() -> Float { seed = seed &* 6364136223846793005 &+ 1; return Float(Double(seed >> 33) / Double(UInt64(1) << 31) * 2 - 1) }
func rms(_ samples: [Float], _ start: Int, _ end: Int) -> Double {
    sqrt(samples[start..<end].reduce(0.0) { $0 + Double($1 * $1) } / Double(end - start))
}
func run(_ name: String, _ channels: [[Float]], amount: Double = 0.6, matched: Bool = true, extension outputExtension: String = "caf") throws -> ([[Float]], NaturalEnhancementReport) {
    print("Checking \(name)"); fflush(stdout)
    let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: AVAudioChannelCount(channels.count))!
    let inputURL = directory.appendingPathComponent("\(name).caf")
    let outputURL = directory.appendingPathComponent("\(name)-out.\(outputExtension)")
    let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(channels[0].count))!
    buffer.frameLength = buffer.frameCapacity
    for c in channels.indices { for i in channels[c].indices { buffer.floatChannelData![c][i] = channels[c][i] } }
    do { let file = try AVAudioFile(forWriting: inputURL, settings: format.settings); try file.write(from: buffer) }
    let params = AudioEnhancerParams.parse(["version": 2, "amount": amount, "matchOriginalLevel": matched ? 1 : 0])!
    let report = try AudioEnhancerRenderer.renderEnhancedAudio(inputFile: AVAudioFile(forReading: inputURL), outputURL: outputURL, params: params)
    let file = try AVAudioFile(forReading: outputURL)
    precondition(file.length == AVAudioFramePosition(channels[0].count), "Sample-exact duration: \(name)")
    precondition(Int(file.processingFormat.channelCount) == channels.count, "Channel count: \(name)")
    let out = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: 2048)!
    var result = channels.map { _ in [Float]() }
    while file.framePosition < file.length {
        try file.read(into: out)
        precondition(out.frameLength > 0, "Readable output until EOF")
        for c in channels.indices { result[c].append(contentsOf: UnsafeBufferPointer(start: out.floatChannelData![c], count: Int(out.frameLength))) }
    }
    precondition(result[0].count == channels[0].count, "All output samples read")
    precondition(result.allSatisfy { $0.allSatisfy { $0.isFinite && abs($0) <= 1.0001 } }, "Finite non-clipping output: \(name)")
    return (result, report)
}
let length = Int(rate * 4)
// Clean low fundamentals, harmonics, vibrato and decays: no invented noise profile.
let tone: [Float] = (0..<length).map { i in
    let t = Double(i) / rate
    let envelope = min(1, t / 0.02) * exp(-t * 0.35)
    return Float(envelope * (0.15 * sin(2 * .pi * 55 * t + 0.1 * sin(2 * .pi * 5 * t)) + 0.07 * sin(2 * .pi * 440 * t) + 0.03 * sin(2 * .pi * 1320 * t)))
}
let (clean, cleanReport) = try run("clean-musical-decay", [tone])
precondition(!cleanReport.noiseProfileFound, "Music must not become the noise profile")
let error = zip(tone, clean[0]).map { $0 - $1 }
precondition(rms(error, 0, length) / rms(tone, 0, length) < 0.00002, "Preserve clean tone and decay")
// Low-level continuous sustained notes are music too, even below the noise threshold.
let quiet = tone.map { $0 * 0.01 }
let (quietOut, quietReport) = try run("quiet-sustain", [quiet])
precondition(!quietReport.noiseProfileFound)
precondition(rms(zip(quiet, quietOut[0]).map { $0 - $1 }, 0, length) / rms(quiet, 0, length) < 0.00002)
// Half a second of ambience, then a bright harmonic instrument over the same noise.
var noisy = [Float](repeating: 0, count: length)
var musical = noisy
for i in 0..<length {
    let t = Double(i) / rate
    noisy[i] = random() * 0.004
    if t >= 1 && t < 3.3 {
        musical[i] = Float(0.10 * sin(2 * .pi * 440 * t) + 0.035 * sin(2 * .pi * 880 * t) + 0.018 * sin(2 * .pi * 1760 * t))
        noisy[i] += musical[i]
    }
}
let (denoised, noiseReport) = try run("steady-noise-plus-instrument", [noisy])
precondition(noiseReport.noiseProfileFound, "Recognize stationary broadband ambience")
let noiseReductionDb = 20 * log10(rms(denoised[0], 12000, 42000) / rms(noisy, 12000, 42000))
precondition(noiseReductionDb < -1 && noiseReductionDb >= -3.7, "Useful bounded noise reduction: \(noiseReductionDb)")
let musicChangeDb = 20 * log10(rms(denoised[0], 72000, 144000) / rms(noisy, 72000, 144000))
precondition(abs(musicChangeDb) < 0.2, "Keep musical energy and harmonics")
// A quiet breath-like/percussive transient is not stationary noise.
var percussion = [Float](repeating: 0, count: length)
for i in 0..<length { let t = Double(i) / rate; let local = t.truncatingRemainder(dividingBy: 0.5); percussion[i] = random() * Float(0.01 * exp(-local * 25)) }
let (_, percussionReport) = try run("brushes-and-decays", [percussion])
precondition(!percussionReport.noiseProfileFound, "Do not learn changing percussive tails as noise")
// Linked masks preserve stereo phase/width, without synthesizing a second channel.
let (stereo, _) = try run("stereo", [noisy, noisy.map { -$0 * 0.5 }])
precondition(zip(stereo[0], stereo[1]).allSatisfy { abs($0 * 0.5 + $1) < 0.00001 })
let (bypassed, bypassReport) = try run("zero-amount", [noisy], amount: 0)
precondition(!bypassReport.noiseProfileFound && abs(bypassReport.gainDb) < 0.00001)
precondition(rms(zip(noisy, bypassed[0]).map { $0 - $1 }, 0, length) < 0.000001)
let (_, liftReport) = try run("quiet-global-gain", [tone.map { $0 * 0.1 }], matched: false)
precondition(liftReport.gainDb > 0 && liftReport.gainDb <= 2.4001, "Bounded constant gain")
let (encoded, _) = try run("aac-export", [tone], extension: "m4a")
precondition(rms(zip(tone, encoded[0]).map { $0 - $1 }, 0, length) / rms(tone, 0, length) < 0.05, "AAC export retains musical signal")
let (tiny, _) = try run("one-sample", [[Float(0.2)]])
precondition(abs(tiny[0][0] - 0.2) < 0.00001)
let (_, silenceReport) = try run("silence", [[Float](repeating: 0, count: 3073)], matched: false)
precondition(!silenceReport.noiseProfileFound && silenceReport.gainDb == 0)
precondition(AudioEnhancerParams.parse(["version": 2, "amount": Double.nan]) == nil)
precondition(AudioEnhancerParams.parse(["version": 2, "amount": 2]) == nil)
print("PASS: tone, low notes, quiet sustain, transients, stereo phase, exact duration, bypass, silence, gain limits, invalid parameters")
print(String(format: "Measured background change: %.2f dB; musical passage change: %.3f dB", noiseReductionDb, musicChangeDb))
