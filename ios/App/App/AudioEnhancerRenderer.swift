import AVFoundation
import AudioToolbox
import Foundation

import Accelerate

/// Versioned instrument-safe processing. Legacy colored presets are migrated
/// at the settings boundary; malformed/unversioned native payloads are rejected.
struct AudioEnhancerParams: Equatable {
    let amount: Double
    let matchOriginalLevel: Bool
    static func parse(_ dict: [String: Any]) -> AudioEnhancerParams? {
        guard (dict["version"] as? NSNumber)?.intValue == 2,
              let amount = (dict["amount"] as? NSNumber)?.doubleValue,
              amount.isFinite, amount >= 0, amount <= 1 else { return nil }
        return AudioEnhancerParams(amount: amount, matchOriginalLevel: (dict["matchOriginalLevel"] as? NSNumber)?.boolValue ?? false)
    }
}

enum AudioEnhancerRendererError: LocalizedError {
    case noAudioTrack
    case extractionFailed(String)
    case renderFailed(String)
    case exportFailed(String)

    var errorDescription: String? {
        switch self {
        case .noAudioTrack: return "Take has no audio track"
        case .extractionFailed(let detail): return "Audio extraction failed: \(detail)"
        case .renderFailed(let detail): return "Enhancer render failed: \(detail)"
        case .exportFailed(let detail): return "Enhanced export failed: \(detail)"
        }
    }
}

final class AudioEnhancerRenderer {
    /// Post-record offline bake — not user-interactive; matches AVAssetExportSession QoS.
    private static let workQueue = DispatchQueue(label: "SessionMirror.AudioEnhancerRenderer", qos: .utility)

    /// Create an enhanced copy. Video takes keep their
    /// video track byte-for-byte (passthrough remux); audio-only takes are
    /// copied into an enhanced AAC render.
    static func enhanceCopy(
        fileURL: URL,
        isVideo: Bool,
        params: AudioEnhancerParams,
        preview: Bool = false,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        workQueue.async {
            Task(priority: .utility) {
                do {
                    let result = try await performEnhance(fileURL: fileURL, isVideo: isVideo, params: params, preview: preview)
                    DispatchQueue.main.async { completion(.success(result)) }
                } catch {
                    DispatchQueue.main.async { completion(.failure(error)) }
                }
            }
        }
    }

    private static let previewDirectoryLock = NSLock()
    private static var previewDirectoryPrepared = false
    private static func previewDirectory() throws -> URL {
        previewDirectoryLock.lock()
        defer { previewDirectoryLock.unlock() }
        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("BestTakeNaturalPreviews", isDirectory: true)
        if !previewDirectoryPrepared {
            // No previews from the previous process are held by a live player.
            if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            previewDirectoryPrepared = true
        }
        return directory
    }

    // MARK: - Pipeline

    private static func performEnhance(
        fileURL: URL,
        isVideo: Bool,
        params: AudioEnhancerParams,
        preview: Bool
    ) async throws -> [String: Any] {
        let tempDir = FileManager.default.temporaryDirectory
        let sourceAudioURL = tempDir.appendingPathComponent("enhancer-src-\(UUID().uuidString).m4a")
        let renderedAudioURL = tempDir.appendingPathComponent("enhancer-out-\(UUID().uuidString).m4a")
        defer {
            try? FileManager.default.removeItem(at: sourceAudioURL)
            try? FileManager.default.removeItem(at: renderedAudioURL)
        }

        // Step A — get an AVAudioFile-readable audio source.
        let inputFile: AVAudioFile
        if isVideo {
            try await extractAudioTrack(from: fileURL, to: sourceAudioURL)
            inputFile = try AVAudioFile(forReading: sourceAudioURL)
        } else if let direct = try? AVAudioFile(forReading: fileURL) {
            inputFile = direct
        } else {
            // Container quirk fallback: extract via passthrough export.
            try await extractAudioTrack(from: fileURL, to: sourceAudioURL)
            inputFile = try AVAudioFile(forReading: sourceAudioURL)
        }

        // Step B — offline render through the enhancer graph.
        // Video: render exactly the input length so A/V durations match.
        // Preserve the original length; instrument decays are already in the recording.
        let tailSeconds: Double = 0
        let report = try renderEnhancedAudio(
            inputFile: inputFile,
            outputURL: renderedAudioURL,
            params: params,
            tailSeconds: tailSeconds
        )

        // Publish a separate durable file. Readers of the original never see a replacement.
        let outputDirectory = preview ? try previewDirectory() : fileURL.deletingLastPathComponent()
        let outputURL = outputDirectory.appendingPathComponent(
            "enhanced-\(UUID().uuidString).\(isVideo ? "mp4" : "m4a")"
        )
        do {
            if isVideo {
                try await remuxVideo(originalURL: fileURL, enhancedAudioURL: renderedAudioURL, outputURL: outputURL)
            } else {
                try FileManager.default.copyItem(at: renderedAudioURL, to: outputURL)
            }
            let duration = CMTimeGetSeconds(AVURLAsset(url: outputURL).duration)
            guard duration.isFinite && duration > 0 else {
                throw AudioEnhancerRendererError.exportFailed("Invalid output duration")
            }
            return ["enhanced": true, "duration": duration, "path": outputURL.absoluteString,
                    "noiseProfileFound": report.noiseProfileFound, "gainDb": report.gainDb, "processingVersion": 2]
        } catch {
            try? FileManager.default.removeItem(at: outputURL)
            throw error
        }
    }

    // MARK: - Step A: extraction

    private static func extractAudioTrack(from sourceURL: URL, to outputURL: URL) async throws {
        let asset = AVURLAsset(url: sourceURL)
        guard let audioTrack = asset.tracks(withMediaType: .audio).first else {
            throw AudioEnhancerRendererError.noAudioTrack
        }

        let composition = AVMutableComposition()
        guard let compositionTrack = composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw AudioEnhancerRendererError.extractionFailed("Cannot create composition track")
        }
        try compositionTrack.insertTimeRange(
            CMTimeRange(start: .zero, duration: asset.duration),
            of: audioTrack,
            at: .zero
        )

        guard let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
            throw AudioEnhancerRendererError.extractionFailed("Cannot create export session")
        }
        export.outputURL = outputURL
        export.outputFileType = .m4a

        try await awaitExportCompletion(export) { detail in
            AudioEnhancerRendererError.extractionFailed(detail)
        }
    }

    // MARK: - Step B: offline render

    @discardableResult
    static func renderEnhancedAudio(
        inputFile: AVAudioFile,
        outputURL: URL,
        params: AudioEnhancerParams,
        tailSeconds: Double = 0
    ) throws -> NaturalEnhancementReport {
        try autoreleasepool {
            try NaturalInstrumentEnhancer.render(input: inputFile, outputURL: outputURL, params: params)
        }
    }

    // MARK: - Step C: remux

    private static func remuxVideo(originalURL: URL, enhancedAudioURL: URL, outputURL: URL) async throws {
        let videoAsset = AVURLAsset(url: originalURL)
        let audioAsset = AVURLAsset(url: enhancedAudioURL)

        guard let videoTrack = videoAsset.tracks(withMediaType: .video).first else {
            throw AudioEnhancerRendererError.exportFailed("Original video track missing")
        }
        guard let audioTrack = audioAsset.tracks(withMediaType: .audio).first else {
            throw AudioEnhancerRendererError.exportFailed("Enhanced audio track missing")
        }

        let composition = AVMutableComposition()
        guard
            let compositionVideo = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ),
            let compositionAudio = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid
            )
        else {
            throw AudioEnhancerRendererError.exportFailed("Cannot create composition tracks")
        }

        try compositionVideo.insertTimeRange(
            CMTimeRange(start: .zero, duration: videoAsset.duration),
            of: videoTrack,
            at: .zero
        )
        compositionVideo.preferredTransform = videoTrack.preferredTransform

        let audioDuration = CMTimeMinimum(audioAsset.duration, videoAsset.duration)
        try compositionAudio.insertTimeRange(
            CMTimeRange(start: .zero, duration: audioDuration),
            of: audioTrack,
            at: .zero
        )

        // Passthrough copies samples without re-encoding the video.
        try await runExport(composition: composition, preset: AVAssetExportPresetPassthrough, outputURL: outputURL)
    }

    private static func runExport(
        composition: AVMutableComposition,
        preset: String,
        outputURL: URL
    ) async throws {
        guard let export = AVAssetExportSession(asset: composition, presetName: preset) else {
            throw AudioEnhancerRendererError.exportFailed("Cannot create export session (\(preset))")
        }

        guard export.supportedFileTypes.contains(.mp4) else {
            if preset == AVAssetExportPresetPassthrough {
                print("[AudioEnhancer] passthrough cannot write mp4 for this composition; retrying with re-encode")
                try await runExport(composition: composition, preset: AVAssetExportPresetHighestQuality, outputURL: outputURL)
                return
            }
            throw AudioEnhancerRendererError.exportFailed("mp4 unsupported for preset \(preset)")
        }

        export.outputURL = outputURL
        export.outputFileType = .mp4

        do {
            try await awaitExportCompletion(export) { detail in
                AudioEnhancerRendererError.exportFailed(detail)
            }
        } catch {
            if preset == AVAssetExportPresetPassthrough {
                let reason = export.error?.localizedDescription ?? (error as? LocalizedError)?.errorDescription ?? "unknown"
                print("[AudioEnhancer] passthrough export failed (\(reason)); retrying with re-encode")
                try? FileManager.default.removeItem(at: outputURL)
                try await runExport(composition: composition, preset: AVAssetExportPresetHighestQuality, outputURL: outputURL)
                return
            }
            throw error
        }
    }

    // MARK: - Helpers

    /// Suspend until AVAssetExportSession finishes without blocking a queue thread.
    private static func awaitExportCompletion(
        _ export: AVAssetExportSession,
        mapFailure: @escaping (String) -> AudioEnhancerRendererError
    ) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            export.exportAsynchronously {
                switch export.status {
                case .completed:
                    continuation.resume()
                case .failed, .cancelled:
                    let detail = export.error?.localizedDescription ?? "status \(export.status.rawValue)"
                    continuation.resume(throwing: mapFailure(detail))
                default:
                    continuation.resume(throwing: mapFailure("status \(export.status.rawValue)"))
                }
            }
        }
    }

}

/// Conservative offline denoising for musical takes. Three bounded-memory passes:
/// identify stationary noise, suppress only low-confidence spectral content,
/// then set one gain for the entire take. No gate, moving loudness target,
/// synthetic space, channel widening or automatic instrument EQ.
struct NaturalEnhancementReport {
    let noiseProfileFound: Bool
    let gainDb: Double
    let noiseFrames: Int
}

private final class InstrumentFFT {
    let size = 2048
    let logSize: vDSP_Length = 11
    let setup: FFTSetup
    let window: [Float]
    init() throws {
        guard let setup = vDSP_create_fftsetup(11, FFTRadix(kFFTRadix2)) else {
            throw AudioEnhancerRendererError.renderFailed("Could not allocate audio analysis")
        }
        self.setup = setup
        window = (0..<2048).map { sqrt(Float(0.5 - 0.5 * cos(2 * Double.pi * Double($0) / 2048))) }
    }
    deinit { vDSP_destroy_fftsetup(setup) }
    func transform(_ real: inout [Float], _ imaginary: inout [Float], inverse: Bool = false) {
        real.withUnsafeMutableBufferPointer { r in
            imaginary.withUnsafeMutableBufferPointer { i in
                var split = DSPSplitComplex(realp: r.baseAddress!, imagp: i.baseAddress!)
                vDSP_fft_zip(setup, &split, 1, logSize, FFTDirection(inverse ? FFT_INVERSE : FFT_FORWARD))
            }
        }
        if inverse { for i in real.indices { real[i] /= Float(size) } }
    }
}

private enum NaturalInstrumentEnhancer {
    static func render(input: AVAudioFile, outputURL: URL, params: AudioEnhancerParams) throws -> NaturalEnhancementReport {
        let format = input.processingFormat
        let channels = Int(format.channelCount)
        guard channels > 0, channels <= 2, format.sampleRate >= 8000, format.sampleRate <= 192000,
              input.length > 0 else {
            throw AudioEnhancerRendererError.renderFailed("Unsupported or empty recording")
        }
        let fft = try InstrumentFFT()
        let n = fft.size, bins = n / 2 + 1, hop = n / 4
        guard let readBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(n)),
              let writeBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(hop)) else {
            throw AudioEnhancerRendererError.renderFailed("Could not allocate audio buffers")
        }
        var noise = [Float](repeating: .infinity, count: bins)
        var candidate = [Float](repeating: 0, count: bins)
        var candidateFrames = 0, acceptedFrames = 0
        var candidateMinDb = Double.infinity, candidateMaxDb = -Double.infinity
        var levelHistogram = [Int](repeating: 0, count: 161)
        var real = [Float](repeating: 0, count: n)
        var imaginary = [Float](repeating: 0, count: n)
        var power = [Float](repeating: 0, count: bins)
        let minimumNoiseFrames = max(3, Int(ceil(0.35 * format.sampleRate / Double(n))))
        let firstNoiseBin = max(1, Int(80 * Double(n) / format.sampleRate))
        input.framePosition = 0
        // Linked-channel statistics avoid changing the stereo image. A tone in
        // either channel protects that frequency in both channels.
        while input.framePosition < input.length {
            try input.read(into: readBuffer, frameCount: AVAudioFrameCount(n))
            let count = Int(readBuffer.frameLength)
            guard count > 0, let samples = readBuffer.floatChannelData else { break }
            power = [Float](repeating: 0, count: bins)
            var energy: Double = 0
            for channel in 0..<channels {
                for i in 0..<n {
                    let value = i < count && samples[channel][i].isFinite ? samples[channel][i] : 0
                    energy += Double(value * value)
                    real[i] = value * fft.window[i]
                    imaginary[i] = 0
                }
                fft.transform(&real, &imaginary)
                for k in 0..<bins { power[k] = max(power[k], real[k] * real[k] + imaginary[k] * imaginary[k]) }
            }
            let rms = sqrt(energy / Double(max(1, count * channels)))
            let db = 20 * log10(max(1e-8, rms))
            levelHistogram[max(0, min(160, Int(db.rounded()) + 160))] += 1
            let selected = power[firstNoiseBin..<(bins - 1)]
            let sum = selected.reduce(0.0) { $0 + Double($1) }
            let mean = sum / Double(selected.count)
            let flatness = exp(selected.reduce(0.0) { $0 + log(max(1e-20, Double($1))) } / Double(selected.count)) / max(1e-20, mean)
            let tonalShare = Double(selected.max() ?? 0) / max(1e-20, sum)
            // A quiet passage is NOT a noise profile. Require broadband,
            // low-level, stable ambience for >=350ms. Otherwise leave it alone.
            let eligible = count == n && db > -100 && db < -42 && flatness > 0.42 && tonalShare < 0.08
            if eligible {
                candidateMinDb = min(candidateMinDb, db)
                candidateMaxDb = max(candidateMaxDb, db)
                if candidateMaxDb - candidateMinDb > 2 {
                    candidateFrames = 0
                    candidate = [Float](repeating: 0, count: bins)
                    candidateMinDb = db; candidateMaxDb = db
                }
                candidateFrames += 1
                for k in 0..<bins { candidate[k] += power[k] }
                if candidateFrames >= minimumNoiseFrames {
                    for k in 0..<bins { noise[k] = min(noise[k], candidate[k] / Float(candidateFrames)) }
                    acceptedFrames += 1
                }
            } else {
                candidateFrames = 0; candidateMinDb = .infinity; candidateMaxDb = -.infinity
                candidate = [Float](repeating: 0, count: bins)
            }
        }
        let hasNoise = acceptedFrames > 0 && params.amount > 0
        // A percentile over active frames excludes long silences from gain
        // decisions. Gain is constant for the take, preserving crescendos.
        let activeStart = 105 // -55 dBFS
        let activeCount = levelHistogram[activeStart...].reduce(0, +)
        var cumulative = 0, activeDb = -24.0
        if activeCount > 0 {
            for index in activeStart...160 {
                cumulative += levelHistogram[index]
                if Double(cumulative) >= Double(activeCount) * 0.7 { activeDb = Double(index - 160); break }
            }
        }
        let requestedGainDb = params.matchOriginalLevel || activeCount == 0 ? 0 : min(4 * params.amount, max(0, -24 - activeDb))
        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("natural-pcm-\(UUID().uuidString).caf")
        defer { try? FileManager.default.removeItem(at: tempURL) }
        var peak: Float = 0
        do {
            let temp = try AVAudioFile(forWriting: tempURL, settings: format.settings, commonFormat: .pcmFormatFloat32, interleaved: false)
            var inputWindow = Array(repeating: [Float](repeating: 0, count: n), count: channels)
            var overlap = inputWindow
            var weights = [Float](repeating: 0, count: n)
            var previousMask = [Float](repeating: 1, count: bins)
            var spectraReal = inputWindow, spectraImaginary = inputWindow
            var previousEnergy: Double = 0
            var attackHold = 0
            input.framePosition = 0
            var start: AVAudioFramePosition = -AVAudioFramePosition(n - hop)
            while start < input.length {
                // Shift a rolling window; the source is read only sequentially.
                for c in 0..<channels {
                    for i in 0..<(n - hop) { inputWindow[c][i] = inputWindow[c][i + hop] }
                    for i in (n - hop)..<n { inputWindow[c][i] = 0 }
                }
                if input.framePosition < input.length {
                    try input.read(into: readBuffer, frameCount: AVAudioFrameCount(hop))
                    if let samples = readBuffer.floatChannelData {
                        for c in 0..<channels { for i in 0..<Int(readBuffer.frameLength) {
                            inputWindow[c][n - hop + i] = samples[c][i].isFinite ? samples[c][i] : 0
                        } }
                    }
                }
                power = [Float](repeating: 0, count: bins)
                var energy: Double = 0
                for c in 0..<channels {
                    for i in 0..<n {
                        let value = inputWindow[c][i]
                        spectraReal[c][i] = value * fft.window[i]
                        spectraImaginary[c][i] = 0
                        energy += Double(value * value)
                    }
                    fft.transform(&spectraReal[c], &spectraImaginary[c])
                    for k in 0..<bins { power[k] = max(power[k], spectraReal[c][k] * spectraReal[c][k] + spectraImaginary[c][k] * spectraImaginary[c][k]) }
                }
                if energy > max(1e-10, previousEnergy * 2.5) { attackHold = 2 }
                previousEnergy = energy
                var mask = [Float](repeating: 1, count: bins)
                var protected = [Bool](repeating: false, count: bins)
                if hasNoise && attackHold == 0 {
                    for k in 1..<(bins - 1) {
                        // Never carve a clear harmonic, even a quiet sustained note.
                        var neighbors: Float = 0; var neighborCount: Float = 0
                        for offset in [-8, -6, -4, 4, 6, 8] {
                            let j = k + offset
                            if j > 0 && j < bins { neighbors += power[j]; neighborCount += 1 }
                        }
                        let tonal = power[k] > 5 * neighbors / max(1, neighborCount)
                        protected[k] = tonal || power[k] > noise[k] * 6
                        let hz = Double(k) * format.sampleRate / Double(n)
                        let floor = Float(pow(10, -(hz < 120 ? 1 : 6) * params.amount / 20))
                        if !protected[k] {
                            mask[k] = sqrt(max(floor * floor, 1 - Float(params.amount * 1.2) * noise[k] / max(1e-20, power[k])))
                        }
                    }
                    let unsmoothed = mask
                    for k in 1..<(bins - 1) { mask[k] = protected[k] ? 1 : (unsmoothed[k - 1] + 2 * unsmoothed[k] + unsmoothed[k + 1]) / 4 }
                }
                for k in 0..<bins {
                    // Open quickly for notes, close slowly for noise; no hard gate.
                    let speed: Float = mask[k] > previousMask[k] ? 0.8 : 0.12
                    previousMask[k] += speed * (mask[k] - previousMask[k])
                    if attackHold > 0 || protected[k] { previousMask[k] = 1 }
                    mask[k] = previousMask[k]
                }
                attackHold = max(0, attackHold - 1)
                for c in 0..<channels {
                    for k in 0..<n {
                        let gain = mask[min(k, n - k)]
                        spectraReal[c][k] *= gain; spectraImaginary[c][k] *= gain
                    }
                    fft.transform(&spectraReal[c], &spectraImaginary[c], inverse: true)
                    for i in 0..<n { overlap[c][i] += spectraReal[c][i] * fft.window[i] }
                }
                for i in 0..<n { weights[i] += fft.window[i] * fft.window[i] }
                if start >= 0 {
                    let count = min(hop, Int(input.length - start))
                    writeBuffer.frameLength = AVAudioFrameCount(count)
                    for c in 0..<channels { for i in 0..<count {
                        let value = overlap[c][i] / max(1e-8, weights[i])
                        peak = max(peak, abs(value))
                        writeBuffer.floatChannelData![c][i] = value
                    } }
                    try temp.write(from: writeBuffer)
                }
                for c in 0..<channels {
                    for i in 0..<(n - hop) { overlap[c][i] = overlap[c][i + hop] }
                    for i in (n - hop)..<n { overlap[c][i] = 0 }
                }
                for i in 0..<(n - hop) { weights[i] = weights[i + hop] }
                for i in (n - hop)..<n { weights[i] = 0 }
                start += AVAudioFramePosition(hop)
            }
        }
        // Leave 1.5 dB sample headroom for encoding. No nonlinear limiter is
        // needed: a measured, constant gain cannot flatten individual attacks.
        let headroomGain = peak > 0 ? 0.841395 / Double(peak) : 1
        let gain = params.amount == 0 ? 1 : min(pow(10, requestedGainDb / 20), headroomGain)
        let pcmOutput = outputURL.pathExtension.lowercased() == "caf"
        let outputSettings: [String: Any] = pcmOutput ? format.settings : [
            AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: channels, AVEncoderBitRateKey: channels == 1 ? 192000 : 256000,
        ]
        let cleaned = try AVAudioFile(forReading: tempURL)
        let output = try AVAudioFile(forWriting: outputURL, settings: outputSettings, commonFormat: .pcmFormatFloat32, interleaved: false)
        while cleaned.framePosition < cleaned.length {
            try cleaned.read(into: readBuffer)
            guard readBuffer.frameLength > 0 else { break }
            for c in 0..<channels { for i in 0..<Int(readBuffer.frameLength) { readBuffer.floatChannelData![c][i] *= Float(gain) } }
            try output.write(from: readBuffer)
        }
        return NaturalEnhancementReport(noiseProfileFound: hasNoise, gainDb: 20 * log10(max(1e-8, gain)), noiseFrames: acceptedFrames)
    }
}
