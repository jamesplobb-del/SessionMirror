import AVFoundation
import Foundation

/// Native monitor transport used while recording multitrack panels.
///
/// The click and every reference file are AVAudioPlayerNodes on the same
/// AVAudioEngine and are started from one future host-time anchor. JavaScript
/// is deliberately not part of the audible schedule; it only mirrors the
/// returned timestamps for UI countdowns.
final class MultitrackTransportEngine {
    static let shared = MultitrackTransportEngine()

    struct Source {
        let id: String
        let url: URL
        let sourceInSec: Double
        let sourceOutSec: Double?
        let timelineDelaySec: Double
        let volume: Float
        let muted: Bool
    }

    struct StartResult {
        let firstClickHostTimeSec: Double
        let performanceHostTimeSec: Double
        let captureAlignmentHostTimeSec: Double
        let firstClickEpochMs: Double
        let performanceEpochMs: Double
        let countInBeats: Int
        let beatDurationSec: Double
        let audibleSourceCount: Int
    }

    private struct PreparedSource {
        let source: Source
        let file: AVAudioFile
        let node: AVAudioPlayerNode
    }

    private let engine = AVAudioEngine()
    private let clickNode = AVAudioPlayerNode()
    private let controlQueue = DispatchQueue(label: "BestTake.MultitrackTransport", qos: .userInitiated)
    private var preparedSources: [PreparedSource] = []
    private var clickBuffer: AVAudioPCMBuffer?
    private var isPrepared = false
    private var isRolling = false

    private init() {}

    func prepare(sources: [Source]) throws -> [String: Any] {
        try controlQueue.sync {
            stopLocked(resetPreparedSources: true)

            // Multitrack owns the native output graph while its recorder is
            // armed. Leaving the ordinary metronome engine running would create
            // two independent output clocks and duplicate click audio.
            MetronomeEngine.shared.stop()
            try AudioRouteConfigurator.prepareMetronomePlaybackSessionIfNeeded()

            engine.stop()
            engine.reset()
            if engine.attachedNodes.contains(clickNode) {
                engine.detach(clickNode)
            }

            engine.attach(clickNode)
            let sessionRate = AVAudioSession.sharedInstance().sampleRate
            let renderRate = sessionRate > 0 ? sessionRate : 48_000
            let clickFormat = AVAudioFormat(
                standardFormatWithSampleRate: renderRate,
                channels: 2
            )!
            engine.connect(clickNode, to: engine.mainMixerNode, format: clickFormat)

            var nextSources: [PreparedSource] = []
            nextSources.reserveCapacity(sources.count)

            for source in sources where !source.muted && source.volume > 0.0001 {
                let file = try AVAudioFile(forReading: source.url)
                guard file.length > 0 else { continue }

                let node = AVAudioPlayerNode()
                node.volume = max(0, min(1, source.volume))
                engine.attach(node)
                engine.connect(node, to: engine.mainMixerNode, format: file.processingFormat)
                nextSources.append(PreparedSource(source: source, file: file, node: node))
            }

            preparedSources = nextSources
            engine.prepare()
            try engine.start()
            isPrepared = true
            isRolling = false

            let route = AudioRouteConfigurator.routeSnapshot()
            let outputPort = route["outputPort"] ?? "unknown"
            print(
                "[MultitrackTransport] prepared sources=\(preparedSources.count) " +
                "sampleRate=\(renderRate) output=\(outputPort)"
            )

            return [
                "prepared": true,
                "sourceCount": preparedSources.count,
                "sampleRate": renderRate,
                "outputPort": route["outputPort"] ?? "unknown",
                "usesHeadphones": route["usesHeadphones"] ?? false,
                "usesBluetoothOutput": route["usesBluetoothOutput"] ?? false,
            ]
        }
    }

    func start(
        bpm: Double,
        beatsPerBar: Int,
        countInBars: Int,
        clickEnabled: Bool,
        soundId: String,
        leadSec: Double = 0.30
    ) throws -> StartResult {
        try controlQueue.sync {
            guard isPrepared else {
                throw NSError(
                    domain: "BestTake.MultitrackTransport",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Multitrack monitor was not prepared"]
                )
            }

            if !engine.isRunning {
                engine.prepare()
                try engine.start()
            }

            stopScheduledNodesLocked()

            let clampedBpm = max(40, min(300, bpm))
            let safeBeatsPerBar = max(1, min(12, beatsPerBar))
            let safeCountInBars = max(0, min(8, countInBars))
            let countInBeats = safeBeatsPerBar * safeCountInBars
            let beatDurationSec = 60.0 / clampedBpm
            let nowHostTime = mach_absolute_time()
            let safeLeadSec = max(0.20, leadSec)
            let firstClickHostTime = nowHostTime + AVAudioTime.hostTime(forSeconds: safeLeadSec)
            let countInDurationSec = Double(countInBeats) * beatDurationSec
            let performanceHostTime = firstClickHostTime + AVAudioTime.hostTime(forSeconds: countInDurationSec)
            let firstClickTime = AVAudioTime(hostTime: firstClickHostTime)
            let clickFormat = engine.outputNode.outputFormat(forBus: 0)
            let usableClickFormat = clickFormat.sampleRate > 0 && clickFormat.channelCount > 0
                ? clickFormat
                : AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
            let bar = makeClickBar(
                format: usableClickFormat,
                bpm: clampedBpm,
                beatsPerBar: safeBeatsPerBar,
                soundId: soundId
            )
            clickBuffer = bar
            clickNode.volume = clickEnabled ? 1 : 0
            clickNode.scheduleBuffer(bar, at: nil, options: [.loops], completionHandler: nil)
            clickNode.play(at: firstClickTime)

            var audibleSourceCount = 0
            for prepared in preparedSources {
                let sampleRate = prepared.file.processingFormat.sampleRate
                guard sampleRate > 0 else { continue }

                let sourceInSec = max(0, prepared.source.sourceInSec)
                let startFrame = min(
                    prepared.file.length,
                    AVAudioFramePosition((sourceInSec * sampleRate).rounded())
                )
                let requestedEndFrame: AVAudioFramePosition
                if let sourceOutSec = prepared.source.sourceOutSec {
                    requestedEndFrame = AVAudioFramePosition((max(sourceInSec, sourceOutSec) * sampleRate).rounded())
                } else {
                    requestedEndFrame = prepared.file.length
                }
                let endFrame = min(prepared.file.length, max(startFrame, requestedEndFrame))
                let remainingFrames = endFrame - startFrame
                guard remainingFrames > 0 else { continue }

                let boundedFrames = AVAudioFrameCount(
                    min(remainingFrames, AVAudioFramePosition(UInt32.max))
                )
                prepared.node.scheduleSegment(
                    prepared.file,
                    startingFrame: startFrame,
                    frameCount: boundedFrames,
                    at: nil,
                    completionHandler: nil
                )

                let sourceDelaySec = max(0, prepared.source.timelineDelaySec)
                let sourceHostTime = performanceHostTime + AVAudioTime.hostTime(forSeconds: sourceDelaySec)
                prepared.node.play(at: AVAudioTime(hostTime: sourceHostTime))
                audibleSourceCount += 1
            }

            isRolling = true

            let nowEpochMs = Date().timeIntervalSince1970 * 1000
            let currentHostTimeSec = AVAudioTime.seconds(forHostTime: mach_absolute_time())
            let firstClickHostTimeSec = AVAudioTime.seconds(forHostTime: firstClickHostTime)
            let scheduledPerformanceHostTimeSec = AVAudioTime.seconds(forHostTime: performanceHostTime)
            // Convert the already-scheduled host anchors to wall time after all
            // buffers are queued. UI work performed above cannot make the
            // countdown timestamps drift later than the audible transport.
            let firstClickEpochMs = nowEpochMs + (firstClickHostTimeSec - currentHostTimeSec) * 1000
            let performanceEpochMs = nowEpochMs + (scheduledPerformanceHostTimeSec - currentHostTimeSec) * 1000
            let session = AVAudioSession.sharedInstance()
            // The monitor downbeat is rendered at performanceHostTime. Shift the
            // capture alignment anchor forward by the current hardware I/O path
            // so newly recorded material is latency-compensated onto that same
            // musical downbeat instead of retaining route delay in the file.
            let hardwareLatencySec = max(
                0,
                session.outputLatency + session.inputLatency + session.ioBufferDuration
            )
            let performanceHostTimeSec = scheduledPerformanceHostTimeSec
            let captureAlignmentHostTimeSec = performanceHostTimeSec + hardwareLatencySec

            print(
                "[MultitrackTransport] rolling bpm=\(clampedBpm) beatsPerBar=\(safeBeatsPerBar) " +
                "countInBeats=\(countInBeats) click=\(clickEnabled) refs=\(audibleSourceCount) " +
                "performanceHost=\(performanceHostTimeSec) hardwareLatency=\(hardwareLatencySec)"
            )

            return StartResult(
                firstClickHostTimeSec: firstClickHostTimeSec,
                performanceHostTimeSec: performanceHostTimeSec,
                captureAlignmentHostTimeSec: captureAlignmentHostTimeSec,
                firstClickEpochMs: firstClickEpochMs,
                performanceEpochMs: performanceEpochMs,
                countInBeats: countInBeats,
                beatDurationSec: beatDurationSec,
                audibleSourceCount: audibleSourceCount
            )
        }
    }

    func stop() {
        controlQueue.sync {
            stopLocked(resetPreparedSources: true)
        }
    }

    private func stopScheduledNodesLocked() {
        clickNode.stop()
        for prepared in preparedSources {
            prepared.node.stop()
        }
        clickBuffer = nil
        isRolling = false
    }

    private func stopLocked(resetPreparedSources: Bool) {
        stopScheduledNodesLocked()
        if resetPreparedSources {
            for prepared in preparedSources where engine.attachedNodes.contains(prepared.node) {
                engine.detach(prepared.node)
            }
            preparedSources.removeAll()
            if engine.attachedNodes.contains(clickNode) {
                engine.detach(clickNode)
            }
            engine.stop()
            engine.reset()
            isPrepared = false
        }
    }

    private func makeClickBar(
        format: AVAudioFormat,
        bpm: Double,
        beatsPerBar: Int,
        soundId: String
    ) -> AVAudioPCMBuffer {
        let sampleRate = format.sampleRate
        let beatFrames = max(1, Int((60.0 / bpm * sampleRate).rounded()))
        let totalFrames = max(1, beatFrames * beatsPerBar)
        let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: AVAudioFrameCount(totalFrames)
        )!
        buffer.frameLength = AVAudioFrameCount(totalFrames)

        guard let channels = buffer.floatChannelData else { return buffer }
        for channel in 0..<Int(format.channelCount) {
            channels[channel].initialize(repeating: 0, count: totalFrames)
        }

        for beat in 0..<beatsPerBar {
            let isDownbeat = beat == 0
            let profile = clickProfile(soundId: soundId, downbeat: isDownbeat)
            let clickFrames = min(
                beatFrames,
                max(64, Int((profile.decaySec * sampleRate).rounded()))
            )
            let start = beat * beatFrames
            for frame in 0..<clickFrames where start + frame < totalFrames {
                let t = Double(frame) / sampleRate
                let envelope = exp(-7.0 * t / max(0.005, profile.decaySec))
                let phase = 2.0 * Double.pi * profile.frequency * t
                let fundamental = sin(phase)
                let attack = frame < max(1, Int(sampleRate * 0.0015))
                    ? (1.0 - Double(frame) / max(1, sampleRate * 0.0015))
                    : 0
                let value = Float((fundamental * 0.82 + attack * 0.18) * envelope * profile.amplitude)
                for channel in 0..<Int(format.channelCount) {
                    channels[channel][start + frame] += value
                }
            }
        }

        return buffer
    }

    private func clickProfile(
        soundId: String,
        downbeat: Bool
    ) -> (frequency: Double, amplitude: Double, decaySec: Double) {
        switch soundId {
        case "woodblock":
            return downbeat ? (1_050, 0.72, 0.040) : (760, 0.50, 0.034)
        case "soft":
            return downbeat ? (820, 0.46, 0.080) : (620, 0.30, 0.066)
        case "electronic":
            return downbeat ? (1_800, 0.64, 0.030) : (1_350, 0.42, 0.026)
        default:
            return downbeat ? (1_200, 0.66, 0.046) : (880, 0.46, 0.040)
        }
    }
}
