import AVFoundation
import AudioToolbox
import Capacitor
import UIKit

/// Native AVPlayer overlay for BestTakeBox quick preview — decodes outside WKWebView
/// so the live camera JPEG bridge is not starved on the main thread.
final class InlineTakeBoxPlaybackController {
    static let shared = InlineTakeBoxPlaybackController()

    private var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    private var audioEngine: AVAudioEngine?
    private var audioPlayer: AVAudioPlayerNode?
    private var audioFile: AVAudioFile?
    private var audioEndWatchdog: DispatchWorkItem?
    private var containerView: UIView?
    private var endObserver: NSObjectProtocol?
    private var startupWatchdog: DispatchWorkItem?
    private weak var plugin: CAPPlugin?
    private var mirrored = false
    private var ownerId = ""
    private var cornerRadius: CGFloat = 0

    private init() {}

    var isActive: Bool {
        player != nil || audioPlayer != nil
    }

    @discardableResult
    func start(
        plugin: CAPPlugin,
        fileURL: URL,
        frameInWindow: CGRect,
        mirror: Bool,
        volume: Float,
        ownerId: String,
        cornerRadius: CGFloat = 0,
        startTime: TimeInterval = 0,
        audioOnly: Bool = false,
        loudnessGainDb: Float = 0
    ) throws -> [String: Any] {
        assert(Thread.isMainThread, "InlineTakeBoxPlaybackController must run on the main thread")
        // Preempting another box's playback: notify so its UI resets.
        stop(notify: true)

        self.plugin = plugin
        self.mirrored = mirror
        self.ownerId = ownerId
        self.cornerRadius = max(0, cornerRadius)

        // Speaker route is primed from JS via prepareInlineTakeBoxPlaybackRoute().

        guard let webView = plugin.bridge?.webView,
              let host = webView.superview else {
            throw NSError(
                domain: "InlineTakeBoxPlayback",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "WebView host unavailable"]
            )
        }

        let frame = host.convert(frameInWindow, from: nil)

        let view = UIView(frame: frame)
        view.backgroundColor = .black
        view.isUserInteractionEnabled = false
        view.clipsToBounds = true
        view.layer.cornerRadius = self.cornerRadius
        view.layer.masksToBounds = true
        view.accessibilityIdentifier = "inline-take-box-playback"

        host.insertSubview(view, aboveSubview: webView)
        self.containerView = view

        if audioOnly {
            return try startAudioOnlyPlayback(
                fileURL: fileURL,
                volume: volume,
                startTime: startTime,
                loudnessGainDb: loudnessGainDb
            )
        }

        let item = AVPlayerItem(url: fileURL)
        let player = AVPlayer(playerItem: item)
        player.volume = volume

        let layer = AVPlayerLayer(player: player)
        layer.frame = view.bounds
        layer.videoGravity = .resizeAspectFill
        applyMirrorTransform(to: layer, in: view.bounds, mirror: mirror)
        view.layer.addSublayer(layer)

        self.player = player
        self.playerLayer = layer

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.stop(notify: true)
        }

        let safeStartTime = max(0, startTime)
        let beginPlayback: () -> Void = { [weak self, weak player] in
            guard let self = self, let player = player, self.player === player else { return }
            player.play()
            self.scheduleStartupWatchdog(for: player)
        }
        if safeStartTime > 0 {
            let seekTime = CMTime(seconds: safeStartTime, preferredTimescale: 600)
            player.seek(to: seekTime, toleranceBefore: .zero, toleranceAfter: .zero) { _ in
                beginPlayback()
            }
        } else {
            beginPlayback()
        }

        let durationSeconds = CMTimeGetSeconds(item.asset.duration)
        let safeDuration = durationSeconds.isFinite && durationSeconds > 0 ? durationSeconds : 0

        print("[InlineTakeBoxPlayback] started fileURL=\(fileURL.lastPathComponent) duration=\(safeDuration) startTime=\(safeStartTime)")

        return [
            "fileURL": fileURL.absoluteString,
            "duration": safeDuration,
        ]
    }

    func updateLayout(plugin: CAPPlugin, frameInWindow: CGRect, cornerRadius: CGFloat? = nil) {
        assert(Thread.isMainThread, "InlineTakeBoxPlaybackController must run on the main thread")
        guard let webView = plugin.bridge?.webView,
              let host = webView.superview,
              let view = containerView,
              let layer = playerLayer else { return }

        if let cornerRadius = cornerRadius {
            self.cornerRadius = max(0, cornerRadius)
            view.layer.cornerRadius = self.cornerRadius
        }

        let frame = host.convert(frameInWindow, from: nil)
        view.frame = frame
        layer.frame = view.bounds
        applyMirrorTransform(to: layer, in: view.bounds, mirror: mirrored)
    }

    func setVolume(_ volume: Float) {
        assert(Thread.isMainThread, "InlineTakeBoxPlaybackController must run on the main thread")
        player?.volume = max(0, min(1, volume))
        audioPlayer?.volume = max(0, min(1, volume))
    }

    func pause() {
        assert(Thread.isMainThread, "InlineTakeBoxPlaybackController must run on the main thread")
        player?.pause()
        audioPlayer?.pause()
    }

    func stop(notify: Bool = true) {
        assert(Thread.isMainThread, "InlineTakeBoxPlaybackController must run on the main thread")
        let hadPlayer = player != nil || audioPlayer != nil
        let endedOwnerId = ownerId
        startupWatchdog?.cancel()
        startupWatchdog = nil
        audioEndWatchdog?.cancel()
        audioEndWatchdog = nil
        if let endObserver = endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
        player?.pause()
        player = nil
        audioPlayer?.stop()
        audioPlayer = nil
        audioEngine?.stop()
        audioEngine = nil
        audioFile = nil
        playerLayer?.removeFromSuperlayer()
        playerLayer = nil
        containerView?.removeFromSuperview()
        containerView = nil
        ownerId = ""
        cornerRadius = 0

        if notify && hadPlayer {
            plugin?.notifyListeners("inlineTakeBoxPlaybackEnded", data: ["ownerId": endedOwnerId])
        }
    }

    private func scheduleStartupWatchdog(for expectedPlayer: AVPlayer) {
        startupWatchdog?.cancel()
        let watchdog = DispatchWorkItem { [weak self, weak expectedPlayer] in
            guard let self = self,
                  let expectedPlayer = expectedPlayer,
                  self.player === expectedPlayer else { return }

            guard expectedPlayer.timeControlStatus != .playing && expectedPlayer.rate <= 0 else { return }
            let status = expectedPlayer.currentItem?.status.rawValue ?? -1
            print("[InlineTakeBoxPlayback] startup stalled status=\(status) timeControlStatus=\(expectedPlayer.timeControlStatus.rawValue)")
            self.stop(notify: true)
        }
        startupWatchdog = watchdog
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5, execute: watchdog)
    }

    private func startAudioOnlyPlayback(
        fileURL: URL,
        volume: Float,
        startTime: TimeInterval,
        loudnessGainDb: Float
    ) throws -> [String: Any] {
        let file = try AVAudioFile(forReading: fileURL)
        let format = file.processingFormat
        let sampleRate = format.sampleRate
        guard sampleRate > 0, file.length > 0 else {
            throw NSError(
                domain: "InlineTakeBoxPlayback",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey: "Audio take is empty"]
            )
        }

        let duration = Double(file.length) / sampleRate
        let safeStartTime = min(max(0, startTime), max(0, duration - 0.001))
        let startFrame = AVAudioFramePosition(safeStartTime * sampleRate)
        let remainingFrames = file.length - startFrame
        guard remainingFrames > 0, remainingFrames <= AVAudioFramePosition(UInt32.max) else {
            throw NSError(
                domain: "InlineTakeBoxPlayback",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Audio take has no playable frames"]
            )
        }

        let engine = AVAudioEngine()
        let audioPlayer = AVAudioPlayerNode()
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

        let appliedGainDb = max(0, min(loudnessGainDb, 30))
        let compressorUnit = compressor.audioUnit
        setParam(compressorUnit, kDynamicsProcessorParam_Threshold, -18)
        setParam(compressorUnit, kDynamicsProcessorParam_HeadRoom, 8)
        setParam(compressorUnit, kDynamicsProcessorParam_AttackTime, 0.003)
        setParam(compressorUnit, kDynamicsProcessorParam_ReleaseTime, 0.08)
        setParam(compressorUnit, kDynamicsProcessorParam_OverallGain, appliedGainDb)
        setParam(limiter.audioUnit, kLimiterParam_AttackTime, 0.001)
        setParam(limiter.audioUnit, kLimiterParam_DecayTime, 0.06)
        setParam(limiter.audioUnit, kLimiterParam_PreGain, 0)

        engine.attach(audioPlayer)
        engine.attach(compressor)
        engine.attach(limiter)
        engine.connect(audioPlayer, to: compressor, format: format)
        engine.connect(compressor, to: limiter, format: format)
        engine.connect(limiter, to: engine.mainMixerNode, format: format)
        audioPlayer.volume = max(0, min(1, volume))
        engine.mainMixerNode.outputVolume = powf(10, -1.0 / 20.0)
        engine.prepare()
        try engine.start()

        self.audioEngine = engine
        self.audioPlayer = audioPlayer
        self.audioFile = file

        audioPlayer.scheduleSegment(
            file,
            startingFrame: startFrame,
            frameCount: AVAudioFrameCount(remainingFrames),
            at: nil,
            completionCallbackType: .dataPlayedBack
        ) { [weak self] _ in
            DispatchQueue.main.async {
                print("[InlineTakeBoxPlayback] native audio engine completed")
                self?.stop(notify: true)
            }
        }
        audioPlayer.play()
        scheduleAudioEndWatchdog(after: duration - safeStartTime)

        print("[InlineTakeBoxPlayback] started native audio engine fileURL=\(fileURL.lastPathComponent) duration=\(duration) startTime=\(safeStartTime) loudnessGainDb=\(appliedGainDb)")
        return [
            "fileURL": fileURL.absoluteString,
            "duration": duration,
            "loudnessGainDb": appliedGainDb,
        ]
    }

    private func setParam(_ unit: AudioUnit, _ parameter: AudioUnitParameterID, _ value: Float) {
        AudioUnitSetParameter(unit, parameter, kAudioUnitScope_Global, 0, value, 0)
    }

    private func scheduleAudioEndWatchdog(after duration: TimeInterval) {
        audioEndWatchdog?.cancel()
        let watchdog = DispatchWorkItem { [weak self] in
            guard let self = self, self.audioPlayer != nil else { return }
            print("[InlineTakeBoxPlayback] native audio end watchdog fired")
            self.stop(notify: true)
        }
        audioEndWatchdog = watchdog
        // AVAudioPlayerNode normally delivers .dataPlayedBack. The fallback
        // makes the UI and hands-free state deterministic if a route change
        // suppresses that callback near the end of a take.
        DispatchQueue.main.asyncAfter(deadline: .now() + max(0.12, duration + 0.12), execute: watchdog)
    }

    private func applyMirrorTransform(to layer: AVPlayerLayer, in bounds: CGRect, mirror: Bool) {
        if mirror {
            layer.setAffineTransform(CGAffineTransform(scaleX: -1, y: 1))
        } else {
            layer.setAffineTransform(.identity)
        }
        layer.frame = bounds
    }
}
