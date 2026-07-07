import AVFoundation
import Foundation

// MARK: - AVAudioSession profiles (native camera test only)

enum NativeCameraAudioSessionProfile: String {
    case videoRecording = "videoRecording"
    case playAndRecordDefault = "playAndRecordDefault"
    case recordVideoRecording = "recordVideoRecording"

    static func parse(_ raw: String?) -> NativeCameraAudioSessionProfile {
        guard let raw = raw, let profile = NativeCameraAudioSessionProfile(rawValue: raw) else {
            return .videoRecording
        }
        return profile
    }

    func apply(to audioSession: AVAudioSession) throws {
        switch self {
        case .videoRecording:
            try AudioRouteConfigurator.debugSetCategory(
                audioSession,
                category: .playAndRecord,
                mode: .videoRecording,
                options: [.defaultToSpeaker],
                caller: "NativeCameraAudioSessionProfile.videoRecording"
            )
        case .playAndRecordDefault:
            try AudioRouteConfigurator.debugSetCategory(
                audioSession,
                category: .playAndRecord,
                mode: .default,
                options: [.defaultToSpeaker],
                caller: "NativeCameraAudioSessionProfile.playAndRecordDefault"
            )
        case .recordVideoRecording:
            try AudioRouteConfigurator.debugSetCategory(
                audioSession,
                category: .record,
                mode: .videoRecording,
                options: [],
                caller: "NativeCameraAudioSessionProfile.recordVideoRecording"
            )
        }
        try AudioRouteConfigurator.debugSetActive(
            audioSession,
            active: true,
            options: [],
            caller: "NativeCameraAudioSessionProfile.\(rawValue)"
        )
        if let builtInMic = audioSession.availableInputs?.first(where: { $0.portType == .builtInMic }) {
            try AudioRouteConfigurator.debugSetPreferredInput(
                audioSession,
                input: builtInMic,
                caller: "NativeCameraAudioSessionProfile.\(rawValue)"
            )
        }
    }

    var logLabel: String {
        switch self {
        case .videoRecording:
            return "playAndRecord + videoRecording + defaultToSpeaker"
        case .playAndRecordDefault:
            return "playAndRecord + default + defaultToSpeaker"
        case .recordVideoRecording:
            return "record + videoRecording"
        }
    }
}

enum NativeCameraTestAudio {
    struct LevelMeasurement {
        let peakDb: Double
        let rmsDb: Double
        let activeRmsDb: Double
    }

    /// Camera-app-like AVAudioSession for loud built-in speaker playback — no capture.
    @discardableResult
    static func prepareCameraLikePlaybackSession(allowWithActivePreview: Bool = false) throws -> [String: Any] {
        guard CameraSessionGuard.canApplyPlaybackSession(allowWithActivePreview: allowWithActivePreview) else {
            CameraSessionGuard.skipRouteChangeLog()
            throw NSError(
                domain: "CameraLikePlayback",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Camera preview or recording active — suspend before playback session"]
            )
        }

        let audioSession = AVAudioSession.sharedInstance()

        print("[PlaybackRoute] applying playback session")
        print("[CameraLikePlayback] applying session")
        let playbackSnapshot: [String: Any]
        if CameraSessionGuard.isCameraOrRecordingActive {
            playbackSnapshot = try AudioRouteConfigurator.applyCoexistentPlaybackSpeakerRoute()
        } else {
            playbackSnapshot = try AudioRouteConfigurator.applyWebPlaybackRoute(webPlaybackActive: true)
        }
        CameraSessionGuard.markPlaybackSessionPrepared()

        let category = (playbackSnapshot["category"] as? String) ?? audioSession.category.rawValue
        let mode = (playbackSnapshot["mode"] as? String) ?? audioSession.mode.rawValue
        let inputRoute = (playbackSnapshot["currentInputRoute"] as? String)
            ?? audioSession.currentRoute.inputs.first?.portType.rawValue
            ?? "none"
        let outputRoute = (playbackSnapshot["currentOutputRoute"] as? String)
            ?? audioSession.currentRoute.outputs.first?.portType.rawValue
            ?? "none"

        print("[CameraLikePlayback] category = \(category)")
        print("[CameraLikePlayback] mode = \(mode)")
        print("[CameraLikePlayback] input route = \(inputRoute)")
        print("[CameraLikePlayback] output route = \(outputRoute)")

        var payload: [String: Any] = [
            "category": category,
            "mode": mode,
            "inputRoute": inputRoute,
            "outputRoute": outputRoute,
        ]
        if let style = playbackSnapshot["playbackRouteStyle"] as? String {
            payload["playbackRouteStyle"] = style
        }
        return payload
    }

    static func sessionDiagnostics(profile: NativeCameraAudioSessionProfile) -> [String: Any] {
        let audioSession = AVAudioSession.sharedInstance()
        let inputRoute = audioSession.currentRoute.inputs.first?.portType.rawValue ?? "none"
        let outputRoute = audioSession.currentRoute.outputs.first?.portType.rawValue ?? "none"

        let snapshot: [String: Any] = [
            "audioSessionProfile": profile.rawValue,
            "category": audioSession.category.rawValue,
            "mode": audioSession.mode.rawValue,
            "inputRoute": inputRoute,
            "outputRoute": outputRoute,
            "sampleRate": audioSession.sampleRate,
            "inputGain": audioSession.inputGain,
            "isInputGainSettable": audioSession.isInputGainSettable,
            "captureInputGain": audioSession.inputGain,
            "captureInputGainSettable": audioSession.isInputGainSettable,
        ]

        print("[NativeCameraTest] audio session")
        print("[NativeCameraTest] profile = \(profile.logLabel)")
        for (key, value) in snapshot.sorted(by: { $0.key < $1.key }) {
            print("[NativeCameraTest] \(key) = \(value)")
        }

        return snapshot
    }

    static func measureLevels(fileURL: URL, maxSeconds: Double = 45) -> LevelMeasurement? {
        let asset = AVURLAsset(url: fileURL)
        guard let track = asset.tracks(withMediaType: .audio).first else { return nil }

        guard let reader = try? AVAssetReader(asset: asset) else { return nil }
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsNonInterleaved: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        guard reader.canAdd(output) else { return nil }
        reader.add(output)
        guard reader.startReading() else { return nil }

        let maxSamples = Int(maxSeconds * 48_000)
        var peak: Float = 0
        var sumSq: Double = 0
        var sampleCount = 0

        while reader.status == .reading, sampleCount < maxSamples {
            guard let sampleBuffer = output.copyNextSampleBuffer(),
                  let block = CMSampleBufferGetDataBuffer(sampleBuffer) else { break }

            var length = 0
            var dataPointer: UnsafeMutablePointer<Int8>?
            guard CMBlockBufferGetDataPointer(
                block,
                atOffset: 0,
                lengthAtOffsetOut: nil,
                totalLengthOut: &length,
                dataPointerOut: &dataPointer
            ) == kCMBlockBufferNoErr, let dataPointer = dataPointer else { continue }

            let floatCount = length / MemoryLayout<Float>.size
            dataPointer.withMemoryRebound(to: Float.self, capacity: floatCount) { floats in
                for i in 0..<floatCount {
                    let sample = floats[i]
                    let abs = fabsf(sample)
                    if abs > peak { peak = abs }
                    sumSq += Double(sample * sample)
                    sampleCount += 1
                }
            }
        }

        guard sampleCount > 0 else { return nil }

        let rms = sqrt(sumSq / Double(sampleCount))
        let activeRms = measureActiveRms(fileURL: fileURL, gateRatio: 0.12, peak: Double(peak), maxSeconds: maxSeconds)
            ?? rms

        return LevelMeasurement(
            peakDb: linearToDb(Double(peak)),
            rmsDb: linearToDb(rms),
            activeRmsDb: linearToDb(activeRms)
        )
    }

    private static func measureActiveRms(
        fileURL: URL,
        gateRatio: Double,
        peak: Double,
        maxSeconds: Double
    ) -> Double? {
        let gate = max(peak * gateRatio, 1e-8)
        let asset = AVURLAsset(url: fileURL)
        guard let track = asset.tracks(withMediaType: .audio).first else { return nil }

        guard let reader = try? AVAssetReader(asset: asset) else { return nil }
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsNonInterleaved: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        guard reader.canAdd(output) else { return nil }
        reader.add(output)
        guard reader.startReading() else { return nil }

        let maxSamples = Int(maxSeconds * 48_000)
        var activeSumSq: Double = 0
        var activeCount = 0
        var sampleCount = 0

        while reader.status == .reading, sampleCount < maxSamples {
            guard let sampleBuffer = output.copyNextSampleBuffer(),
                  let block = CMSampleBufferGetDataBuffer(sampleBuffer) else { break }

            var length = 0
            var dataPointer: UnsafeMutablePointer<Int8>?
            guard CMBlockBufferGetDataPointer(
                block,
                atOffset: 0,
                lengthAtOffsetOut: nil,
                totalLengthOut: &length,
                dataPointerOut: &dataPointer
            ) == kCMBlockBufferNoErr, let dataPointer = dataPointer else { continue }

            let floatCount = length / MemoryLayout<Float>.size
            dataPointer.withMemoryRebound(to: Float.self, capacity: floatCount) { floats in
                for i in 0..<floatCount {
                    let sample = Double(floats[i])
                    if abs(sample) >= gate {
                        activeSumSq += sample * sample
                        activeCount += 1
                    }
                    sampleCount += 1
                }
            }
        }

        guard activeCount > 0 else { return nil }
        return sqrt(activeSumSq / Double(activeCount))
    }

    static func logFileLevels(_ levels: LevelMeasurement) {
        print("[NativeCameraTest] file levels")
        print("[NativeCameraTest] recordedPeakDb = \(String(format: "%.1f", levels.peakDb))")
        print("[NativeCameraTest] recordedRmsDb = \(String(format: "%.1f", levels.rmsDb))")
        print("[NativeCameraTest] recordedActiveRmsDb = \(String(format: "%.1f", levels.activeRmsDb))")
    }

    static func levelsPayload(_ levels: LevelMeasurement) -> [String: Any] {
        [
            "recordedPeakDb": levels.peakDb,
            "recordedRmsDb": levels.rmsDb,
            "recordedActiveRmsDb": levels.activeRmsDb,
        ]
    }

    private static func linearToDb(_ value: Double) -> Double {
        20 * log10(max(value, 1e-8))
    }
}
