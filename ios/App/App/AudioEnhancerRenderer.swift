import AVFoundation
import AudioToolbox
import Foundation

/// Offline "bake" of the Audio Enhancer into a recorded take file.
///
/// Mirrors the WebAudio playback chain in src/utils/audioEnhancer.ts:
///   input → 3-band EQ → compressor → { dry, reverb → wet gain } → sum → limiter → −1 dB ceiling
/// Uses AVAudioEngine manual rendering (never touches AVAudioSession, so it is
/// safe to run while the native camera session is live). The original file is
/// left untouched on ANY failure.
struct AudioEnhancerParams {
    let lowHz: Double
    let lowGainDb: Float
    let midHz: Double
    let midQ: Float
    let midGainDb: Float
    let highHz: Double
    let highGainDb: Float

    let thresholdDb: Float
    let ratio: Float
    let attackSec: Float
    let releaseSec: Float
    let makeupDb: Float

    /// Final wet-path gain (JS reverbSend.gain × wetGain.gain product), 0 disables reverb.
    let reverbWetLevel: Float

    static func parse(_ dict: [String: Any]) -> AudioEnhancerParams? {
        func number(_ key: String) -> Double? {
            (dict[key] as? NSNumber)?.doubleValue
        }
        guard
            let lowHz = number("lowHz"),
            let lowGainDb = number("lowGainDb"),
            let midHz = number("midHz"),
            let midQ = number("midQ"),
            let midGainDb = number("midGainDb"),
            let highHz = number("highHz"),
            let highGainDb = number("highGainDb"),
            let thresholdDb = number("thresholdDb"),
            let ratio = number("ratio"),
            let attackSec = number("attackSec"),
            let releaseSec = number("releaseSec"),
            let makeupDb = number("makeupDb"),
            let reverbWetLevel = number("reverbWetLevel")
        else {
            return nil
        }
        return AudioEnhancerParams(
            lowHz: lowHz,
            lowGainDb: Float(lowGainDb),
            midHz: midHz,
            midQ: Float(midQ),
            midGainDb: Float(midGainDb),
            highHz: highHz,
            highGainDb: Float(highGainDb),
            thresholdDb: Float(thresholdDb),
            ratio: Float(ratio),
            attackSec: Float(attackSec),
            releaseSec: Float(releaseSec),
            makeupDb: Float(makeupDb),
            reverbWetLevel: Float(reverbWetLevel)
        )
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
    private static let workQueue = DispatchQueue(label: "SessionMirror.AudioEnhancerRenderer", qos: .userInitiated)

    /// Enhance the audio of a recorded take in place. Video takes keep their
    /// video track byte-for-byte (passthrough remux); audio-only takes are
    /// replaced with the enhanced AAC render.
    static func enhanceInPlace(
        fileURL: URL,
        isVideo: Bool,
        params: AudioEnhancerParams,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        workQueue.async {
            do {
                let result = try performEnhance(fileURL: fileURL, isVideo: isVideo, params: params)
                DispatchQueue.main.async { completion(.success(result)) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    // MARK: - Pipeline

    private static func performEnhance(
        fileURL: URL,
        isVideo: Bool,
        params: AudioEnhancerParams
    ) throws -> [String: Any] {
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
            try extractAudioTrack(from: fileURL, to: sourceAudioURL)
            inputFile = try AVAudioFile(forReading: sourceAudioURL)
        } else if let direct = try? AVAudioFile(forReading: fileURL) {
            inputFile = direct
        } else {
            // Container quirk fallback: extract via passthrough export.
            try extractAudioTrack(from: fileURL, to: sourceAudioURL)
            inputFile = try AVAudioFile(forReading: sourceAudioURL)
        }

        // Step B — offline render through the enhancer graph.
        // Video: render exactly the input length so A/V durations match.
        // Audio-only: allow a reverb ring-out tail.
        let tailSeconds: Double = (!isVideo && params.reverbWetLevel > 0.0005) ? 1.5 : 0
        try renderEnhancedAudio(
            inputFile: inputFile,
            outputURL: renderedAudioURL,
            params: params,
            tailSeconds: tailSeconds
        )

        // Step C — reassemble and atomically replace the original.
        if isVideo {
            let remuxedURL = tempDir.appendingPathComponent("enhancer-mux-\(UUID().uuidString).mp4")
            defer { try? FileManager.default.removeItem(at: remuxedURL) }
            try remuxVideo(originalURL: fileURL, enhancedAudioURL: renderedAudioURL, outputURL: remuxedURL)
            _ = try FileManager.default.replaceItemAt(fileURL, withItemAt: remuxedURL)
        } else {
            _ = try FileManager.default.replaceItemAt(fileURL, withItemAt: renderedAudioURL)
        }

        let finalAsset = AVURLAsset(url: fileURL)
        let duration = CMTimeGetSeconds(finalAsset.duration)
        return [
            "enhanced": true,
            "duration": duration.isFinite && duration > 0 ? duration : 0,
        ]
    }

    // MARK: - Step A: extraction

    private static func extractAudioTrack(from sourceURL: URL, to outputURL: URL) throws {
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

        let semaphore = DispatchSemaphore(value: 0)
        export.exportAsynchronously { semaphore.signal() }
        semaphore.wait()

        guard export.status == .completed else {
            throw AudioEnhancerRendererError.extractionFailed(
                export.error?.localizedDescription ?? "status \(export.status.rawValue)"
            )
        }
    }

    // MARK: - Step B: offline render

    private static func renderEnhancedAudio(
        inputFile: AVAudioFile,
        outputURL: URL,
        params: AudioEnhancerParams,
        tailSeconds: Double
    ) throws {
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        let eq = AVAudioUnitEQ(numberOfBands: 3)
        let compressor = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
            componentType: kAudioUnitType_Effect,
            componentSubType: kAudioUnitSubType_DynamicsProcessor,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        ))
        let limiter = AVAudioUnitEffect(audioComponentDescription: AudioComponentDescription(
            componentType: kAudioUnitType_Effect,
            componentSubType: kAudioUnitSubType_PeakLimiter,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        ))
        let reverb = AVAudioUnitReverb()
        let postCompressor = AVAudioMixerNode()
        let wetGain = AVAudioMixerNode()
        let sum = AVAudioMixerNode()

        let sourceFormat = inputFile.processingFormat
        guard let format = AVAudioFormat(
            standardFormatWithSampleRate: sourceFormat.sampleRate,
            channels: sourceFormat.channelCount
        ) else {
            throw AudioEnhancerRendererError.renderFailed("Unsupported source format")
        }

        // EQ bands (frequencies from the per-preset tuning table; gains are user dB).
        let low = eq.bands[0]
        low.filterType = .lowShelf
        low.frequency = Float(params.lowHz)
        low.gain = params.lowGainDb
        low.bypass = false

        let mid = eq.bands[1]
        mid.filterType = .parametric
        mid.frequency = Float(params.midHz)
        // AudioUnit parametric bandwidth is in octaves, not Q.
        mid.bandwidth = qToOctaveBandwidth(params.midQ)
        mid.gain = params.midGainDb
        mid.bypass = false

        let high = eq.bands[2]
        high.filterType = .highShelf
        high.frequency = Float(params.highHz)
        high.gain = params.highGainDb
        high.bypass = false

        let useReverb = params.reverbWetLevel > 0.0005
        reverb.loadFactoryPreset(.mediumRoom)
        reverb.wetDryMix = 100 // wet-only; dry path is the parallel branch
        wetGain.outputVolume = params.reverbWetLevel
        postCompressor.outputVolume = 1.0

        engine.attach(player)
        engine.attach(eq)
        engine.attach(compressor)
        engine.attach(postCompressor)
        engine.attach(sum)
        engine.attach(limiter)
        if useReverb {
            engine.attach(reverb)
            engine.attach(wetGain)
        }

        engine.connect(player, to: eq, format: format)
        engine.connect(eq, to: compressor, format: format)
        if useReverb {
            // Fan out: dry to the sum, wet through reverb → wet gain → sum.
            engine.connect(postCompressor, to: [
                AVAudioConnectionPoint(node: sum, bus: sum.nextAvailableInputBus),
                AVAudioConnectionPoint(node: reverb, bus: 0),
            ], fromBus: 0, format: format)
            engine.connect(reverb, to: wetGain, format: format)
            engine.connect(wetGain, to: sum, fromBus: 0, toBus: sum.nextAvailableInputBus, format: format)
        } else {
            engine.connect(postCompressor, to: sum, format: format)
        }
        engine.connect(compressor, to: postCompressor, format: format)
        engine.connect(sum, to: limiter, format: format)
        engine.connect(limiter, to: engine.mainMixerNode, format: format)
        // −1 dB output ceiling (PeakLimiter itself ceilings at 0 dBFS).
        engine.mainMixerNode.outputVolume = powf(10, -1.0 / 20.0)

        // Compressor mapping from the WebAudio DynamicsCompressor semantics.
        // Note: attack/release are already seconds on both sides. The AudioUnit
        // has no ratio/knee params — ratio is approximated via HeadRoom.
        let compUnit = compressor.audioUnit
        setParam(compUnit, kDynamicsProcessorParam_Threshold, params.thresholdDb)
        let headRoom = max(0.1, min(40, abs(params.thresholdDb) / max(1, params.ratio)))
        setParam(compUnit, kDynamicsProcessorParam_HeadRoom, headRoom)
        setParam(compUnit, kDynamicsProcessorParam_AttackTime, params.attackSec)
        setParam(compUnit, kDynamicsProcessorParam_ReleaseTime, params.releaseSec)
        setParam(compUnit, kDynamicsProcessorParam_OverallGain, params.makeupDb)

        // Limiter: WebAudio used attack 0.001 / release 0.075; DecayTime max is 0.06.
        let limiterUnit = limiter.audioUnit
        setParam(limiterUnit, kLimiterParam_AttackTime, 0.001)
        setParam(limiterUnit, kLimiterParam_DecayTime, 0.06)
        setParam(limiterUnit, kLimiterParam_PreGain, 0)

        try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: 4096)
        try engine.start()
        player.scheduleFile(inputFile, at: nil)
        player.play()

        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: Int(format.channelCount),
            AVEncoderBitRateKey: 192_000,
        ]
        let outputFile = try AVAudioFile(
            forWriting: outputURL,
            settings: outputSettings,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )

        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: engine.manualRenderingFormat,
            frameCapacity: engine.manualRenderingMaximumFrameCount
        ) else {
            engine.stop()
            throw AudioEnhancerRendererError.renderFailed("Cannot allocate render buffer")
        }

        let tailFrames = AVAudioFramePosition(tailSeconds * format.sampleRate)
        let targetFrames = inputFile.length + tailFrames
        var renderedFrames: AVAudioFramePosition = 0
        var stallGuard = 0

        while renderedFrames < targetFrames {
            let framesToRender = AVAudioFrameCount(min(
                AVAudioFramePosition(buffer.frameCapacity),
                targetFrames - renderedFrames
            ))
            let status = try engine.renderOffline(framesToRender, to: buffer)
            switch status {
            case .success:
                try outputFile.write(from: buffer)
                renderedFrames += AVAudioFramePosition(buffer.frameLength)
                stallGuard = 0
            case .insufficientDataFromInputNode, .cannotDoInCurrentContext:
                stallGuard += 1
                if stallGuard > 1000 {
                    engine.stop()
                    throw AudioEnhancerRendererError.renderFailed("Render stalled")
                }
            case .error:
                engine.stop()
                throw AudioEnhancerRendererError.renderFailed("renderOffline returned error")
            @unknown default:
                engine.stop()
                throw AudioEnhancerRendererError.renderFailed("Unknown render status")
            }
        }

        player.stop()
        engine.stop()
    }

    // MARK: - Step C: remux

    private static func remuxVideo(originalURL: URL, enhancedAudioURL: URL, outputURL: URL) throws {
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
        try runExport(composition: composition, preset: AVAssetExportPresetPassthrough, outputURL: outputURL)
    }

    private static func runExport(
        composition: AVMutableComposition,
        preset: String,
        outputURL: URL
    ) throws {
        guard let export = AVAssetExportSession(asset: composition, presetName: preset) else {
            throw AudioEnhancerRendererError.exportFailed("Cannot create export session (\(preset))")
        }

        guard export.supportedFileTypes.contains(.mp4) else {
            if preset == AVAssetExportPresetPassthrough {
                print("[AudioEnhancer] passthrough cannot write mp4 for this composition; retrying with re-encode")
                try runExport(composition: composition, preset: AVAssetExportPresetHighestQuality, outputURL: outputURL)
                return
            }
            throw AudioEnhancerRendererError.exportFailed("mp4 unsupported for preset \(preset)")
        }

        export.outputURL = outputURL
        export.outputFileType = .mp4

        let semaphore = DispatchSemaphore(value: 0)
        export.exportAsynchronously { semaphore.signal() }
        semaphore.wait()

        if export.status != .completed {
            if preset == AVAssetExportPresetPassthrough {
                print("[AudioEnhancer] passthrough export failed (\(export.error?.localizedDescription ?? "unknown")); retrying with re-encode")
                try? FileManager.default.removeItem(at: outputURL)
                try runExport(composition: composition, preset: AVAssetExportPresetHighestQuality, outputURL: outputURL)
                return
            }
            throw AudioEnhancerRendererError.exportFailed(
                export.error?.localizedDescription ?? "status \(export.status.rawValue)"
            )
        }
    }

    // MARK: - Helpers

    /// WebAudio biquad Q → AudioUnit parametric bandwidth in octaves.
    private static func qToOctaveBandwidth(_ q: Float) -> Float {
        let safeQ = max(0.05, q)
        return Float(2 * asinh(1 / (2 * Double(safeQ))) / log(2))
    }

    private static func setParam(_ unit: AudioUnit, _ param: AudioUnitParameterID, _ value: Float) {
        AudioUnitSetParameter(unit, param, kAudioUnitScope_Global, 0, value, 0)
    }
}
