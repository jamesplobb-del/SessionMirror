import Accelerate
import AVFoundation
import CoreMedia
import Foundation
import UIKit

/// Native AVCaptureSession recorder — bypasses WKWebView getUserMedia.
final class NativeCameraRecordingEngine: NSObject, AVCaptureFileOutputRecordingDelegate, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    static let shared = NativeCameraRecordingEngine()

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "SessionMirror.NativeCameraRecording")
    private let frameBridgeQueue = DispatchQueue(label: "SessionMirror.NativeCameraFrameBridge")
    private let frameEncodeQueue = DispatchQueue(label: "SessionMirror.NativeCameraFrameEncode", qos: .userInitiated)
    private var movieOutput: AVCaptureMovieFileOutput?
    private var videoDataOutput: AVCaptureVideoDataOutput?
    private var audioDataOutput: AVCaptureAudioDataOutput?
    private let audioTapQueue = DispatchQueue(label: "SessionMirror.NativeAudioTap")
    /// Base64 encoding + the JS bridge notify are real work (~every 43ms during
    /// live pitch tracking) — keep them off audioTapQueue, which is the exact
    /// queue AVCaptureAudioDataOutput uses to hand off buffers. AVFoundation
    /// expects that queue to return fast; doing bridge work on it for a
    /// sustained recording risks the OS silently throttling/dropping the
    /// shared audio input (observed: long takes finish with audioTrackCount=0
    /// in the movie file despite the connection reporting active the whole
    /// time and zero interruption/route-change events).
    private let audioTapEncodeQueue = DispatchQueue(label: "SessionMirror.NativeAudioTapEncode", qos: .utility)

    /// Backpressure for audioTapEncodeQueue.
    ///
    /// The tap produces a chunk every ~43ms in real time, and the dispatch to
    /// the encode queue is `async` — unbounded. Base64 encoding plus the
    /// Capacitor bridge notify is not guaranteed to keep up: with the
    /// metronome engine, the pitch DSP and the UI all competing for CPU the
    /// consumer falls behind and the queue grows monotonically. Each pending
    /// block retains an 8KB sample array and produces an ~11KB String, so a
    /// couple of minutes of drift is enough growth for iOS to jetsam the app
    /// — which presents to the user as the app restarting on its own.
    ///
    /// Dropping a pitch frame under overload is harmless: the next one is
    /// 43ms behind it and detection re-locks immediately. This cap only
    /// engages once the encoder is already behind, so the steady-state frame
    /// rate — and the pitch graph — is untouched.
    private let audioTapBacklogLock = NSLock()
    private var audioTapBacklog = 0
    private static let audioTapMaxBacklog = 3
    private var isAudioTapEnabled = false
    private var tapAccumulator: [Float] = []
    private var didLogFirstTapSample = false
    private var didLogTapExtractionFailure = false
    private var isSessionConfigured = false
    private var isRecording = false
    private var isStarting = false
    /// Set by stopBridgePreview / stopPreview when the session is intentionally
    /// torn down for app-background. Guarantees a full configureCaptureSession
    /// rebuild on the next startBridgePreview / startPreview / startRecording
    /// regardless of whether session.isRunning has already flipped to false.
    /// Using an explicit flag avoids the timing-dependency on session.isRunning
    /// since both stopRunning() and the subsequent start call run on the same
    /// serial sessionQueue, but the deactivation of the shared AVAudioSession
    /// (which is what actually leaves the audio input stale) is a separate
    /// path that doesn't change session.isRunning.
    private var needsAudioPipelineRebuild = false
    private var isFrameBridgeActive = false
    /// A JS consumer (multitrack stage, thumbnail capture) asked for pump frames
    /// while the layer preview is the primary display path.
    private var isFrameBridgeExternallyRequested = false
    private var previewZoom: CGFloat = 1
    private var lastBridgeFrameTime: CFTimeInterval = 0
    private var pendingBridgeSample: CMSampleBuffer?
    private var isBridgeEncoding = false
    private var bridgeGeneration: UInt64 = 0
    private var nextBridgeFrameId: UInt64 = 0
    private var bridgeFrameAwaitingAck: UInt64?
    private var consecutiveBridgeAckTimeouts = 0
    private let bridgeFrameAckTimeout: TimeInterval = 0.25
    private let bridgeMaxAckTimeouts = 3
    /// Retry cadence once the ack budget is spent. Delivery is throttled, never
    /// abandoned — see the timeout handler in `drainBridgeFrames()`.
    private let bridgeStalledRetryInterval: TimeInterval = 0.5
    private var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }
    /// Preview JPEG pump — recording uses AVCaptureMovieFileOutput at full session resolution.
    /// Keep the admission ceiling above the camera's usual 30fps cadence. A
    /// 30fps ceiling can reject every other 30fps frame when callback jitter
    /// lands just below 33.3ms, making the preview look closer to 15fps. The
    /// acknowledgement gate below remains the real load-sensitive backpressure.
    private let bridgeFramesPerSecondFull: Double = 45
    /// Play-along uses smaller JPEGs and a slightly lower ceiling, while still
    /// staying above a 30fps source cadence to avoid the same aliasing.
    private let bridgeFramesPerSecondRecordingPlayAlong: Double = 36
    // Preview-only pump sizing. The recorded movie file uses a separate
    // full-resolution AVCaptureMovieFileOutput and is UNAFFECTED by these.
    // 1080px/0.75 JPEG base64 at 60fps saturates the Capacitor/WKWebView bridge
    // and stutters; 720px/0.6 is ample for an on-screen phone preview and cuts
    // per-frame payload ~2.5x, letting the bridge sustain a far smoother rate.
    // iPad gets a modest bump (960px) — larger display, more SoC headroom — but
    // stays below full 1080 bridge flood levels.
    private var bridgeMaxPixelDimension: CGFloat { isPad ? 960 : 720 }
    private var bridgeJpegQuality: CGFloat { isPad ? 0.68 : 0.6 }
    private let bridgeMaxPixelDimensionRecordingPlayAlong: CGFloat = 540
    private let bridgeJpegQualityRecordingPlayAlong: CGFloat = 0.45
    private lazy var ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private lazy var bridgeColorSpace = CGColorSpaceCreateDeviceRGB()
    private var outputURL: URL?
    private var startCompletion: ((Result<[String: Any], Error>) -> Void)?
    private var pendingStartResult: [String: Any]?
    private var stopCompletion: ((Result<[String: Any], Error>) -> Void)?
    private var pendingTrimStartMs: Int = 0
    private var recordedVideoWidth: Int = 0
    private var recordedVideoHeight: Int = 0
    private var activeAudioProfile: NativeCameraAudioSessionProfile = .videoRecording
    private var activeMicInputPreference: AudioRouteConfigurator.MicInputPreference = .auto
    private weak var previewContainer: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var isPreviewActive = false
    private var isBridgePreviewActive = false
    private var previewUsesFrontCamera = true
    private let interfaceOrientationLock = NSLock()
    private var padInterfaceOrientation: UIInterfaceOrientation = .portrait
    private var lastPadInputOrientation: AVAudioSession.StereoOrientation?

    /// Delivers JPEG base64 (no data-URL prefix) to the Capacitor plugin for canvas preview in the WebView.
    var onPreviewFrame: ((_ jpegBase64: String, _ width: Int, _ height: Int, _ frameId: UInt64) -> Void)?

    /// Delivers mono Float32 PCM chunks (base64, sampleRate, sampleCount) for the JS pitch tracker.
    private var tunerPitchEnabled = false
    private var tunerPitchSamples: [Float] = []
    private var tunerPitchSampleRate: Double = 0
    /// Compact pitch results only. The full tuner never sends PCM through WebKit.
    var onTunerPitch: ((_ frequency: Double, _ confidence: Double, _ rmsDb: Double) -> Void)?
    private let tunerPitchWorkQueue = DispatchQueue(label: "com.besttake.tuner-detection", qos: .userInitiated)
    private let tunerPitchWorkLock = NSLock()
    private var tunerPitchWorkPending = false
    private var tunerPitchGeneration = 0

    func setTunerPitchEnabled(_ enabled: Bool) {
        audioTapQueue.async {
            self.tunerPitchEnabled = enabled
            self.tunerPitchSamples.removeAll(keepingCapacity: enabled)
            self.tunerPitchGeneration += 1
        }
    }

    var onAudioTapChunk: ((_ pcmBase64: String, _ sampleRate: Double, _ sampleCount: Int) -> Void)?

    /// True once a `mediaServicesWereReset` notification fires — hardware objects
    /// (session, inputs, outputs) are invalidated and MUST be rebuilt from scratch
    /// before `startRunning()` will do anything useful again.
    private var needsFullReconfigureAfterMediaReset = false

    /// Set when `ensureSessionHealthy` is asked to run while review playback
    /// owns the `AVAudioSession` (`CameraSessionGuard.playbackRouteActive`).
    /// Recovery is deferred rather than skipped outright — as soon as
    /// playback releases ownership, `runDeferredHealthCheckIfNeeded()` replays
    /// the most recent deferred reason.
    private var deferredHealthCheckReason: String?
    /*
     * Self-heal backoff.
     *
     * A capture-session runtime error triggers a rebuild, and a rebuild that
     * cannot succeed posts another runtime error — so a session that is
     * genuinely unrecoverable (the mic held by another app, a route that keeps
     * failing, a simulator with no capture source) span this loop as fast as
     * the notifications arrived. Thousands of AVCaptureSession rebuilds a
     * minute is what killed the app out from under a long tuner sitting.
     *
     * The first failure still recovers immediately; each consecutive one waits
     * longer, and a session that comes back healthy clears the count. Recovery
     * is never abandoned — it just stops being a hot loop.
     * Touched only on `sessionQueue`.
     */
    private var consecutiveRecoveryAttempts = 0
    private var lastRecoveryAttemptAt: CFTimeInterval = 0

    /// Diagnostic-only: logs movie audio connection state + time-since-last-
    /// tap-sample every 2s during an active recording. Two prior fixes (audio
    /// tap encode queue, preview bridge fps) both failed to resolve
    /// audioTrackCount=0 on long takes, so instead of guessing a third
    /// mitigation blind, this pinpoints WHEN during a take the audio
    /// connection actually goes dark.
    private var recordingDiagnosticsTimer: DispatchSourceTimer?
    private var lastAudioTapSampleTime: CFTimeInterval = 0
    private var stopProcessingStartedAt: CFTimeInterval = 0
    private func logStopStage(_ stage: String) {
        guard stopProcessingStartedAt > 0 else { return }
        print("[RecordingTiming] \(stage) elapsedMs=\(Int((CACurrentMediaTime() - stopProcessingStartedAt) * 1000))")
    }
    private var recordingDiagnosticsStartTime: CFTimeInterval = 0
    // Written from the same AVCaptureAudioDataOutput that powers live pitch.
    // If AVCaptureMovieFileOutput finalizes a long take without an audio track,
    // we mux this backup audio into the saved MP4 before returning it to JS.
    private var audioFallbackWriter: AVAssetWriter?
    private var audioFallbackInput: AVAssetWriterInput?
    private var audioFallbackURL: URL?
    private var audioFallbackCaptureActive = false
    private var audioFallbackStarted = false
    private var audioFallbackSampleCount = 0
    /// Host-clock timestamp of the first captured audio sample in the current
    /// movie file. Combined with the native multitrack performance anchor this
    /// produces a measured source-in offset instead of a JS timer estimate.
    private var multitrackFirstAudioSampleHostTimeSec: Double?
    private var multitrackPerformanceAnchorHostTimeSec: Double?
    /// Performance downbeat expressed directly on the movie file's own time
    /// axis. This is the canonical multitrack source-in value.
    private var multitrackPerformanceFileTimeSec: Double?
    /// Audio-mode takes: mic-only session writing AAC via AVAssetWriter (no movie output).
    private var isAudioOnlyRecording = false
    private var isTunerMonitorActive = false
    private var audioOnlyTakeId: String?

    func setMultitrackPerformanceAnchor(hostTimeSec: Double) {
        let recordedDurationSec: Double? = sessionQueue.sync {
            guard let movieOutput = self.movieOutput else { return nil }
            let seconds = CMTimeGetSeconds(movieOutput.recordedDuration)
            return seconds.isFinite && seconds >= 0 ? seconds : nil
        }
        let nowHostTimeSec = AVAudioTime.seconds(forHostTime: mach_absolute_time())
        let fileTimeSec = recordedDurationSec.map {
            $0 + max(0, hostTimeSec - nowHostTimeSec)
        }
        audioTapQueue.sync {
            self.multitrackPerformanceAnchorHostTimeSec = hostTimeSec
            self.multitrackPerformanceFileTimeSec = fileTimeSec
            print(
                "[MultitrackCapture] performanceAnchorHost=\(hostTimeSec) " +
                "recordedDuration=\(recordedDurationSec ?? -1) fileTime=\(fileTimeSec ?? -1)"
            )
        }
    }

    private func startRecordingDiagnosticsTimer() {
        recordingDiagnosticsTimer?.cancel()
        recordingDiagnosticsStartTime = CACurrentMediaTime()
        lastAudioTapSampleTime = recordingDiagnosticsStartTime
        let timer = DispatchSource.makeTimerSource(queue: sessionQueue)
        timer.schedule(deadline: .now() + 2, repeating: 2)
        timer.setEventHandler { [weak self] in
            guard let self = self else { return }
            let elapsed = CACurrentMediaTime() - self.recordingDiagnosticsStartTime
            let sinceLastTapSample = CACurrentMediaTime() - self.lastAudioTapSampleTime
            if self.isAudioOnlyRecording {
                let sinceLastTapSample = CACurrentMediaTime() - self.lastAudioTapSampleTime
                print(
                    "[RecordingHealthCheck] t=\(String(format: "%.1f", elapsed))s " +
                    "audioOnlyCapture sessionRunning=\(self.session.isRunning) " +
                    "sinceLastTapSample=\(String(format: "%.2f", sinceLastTapSample))s"
                )
            } else if let movieOutput = self.movieOutput, let audioConnection = movieOutput.connection(with: .audio) {
                print(
                    "[RecordingHealthCheck] t=\(String(format: "%.1f", elapsed))s " +
                    "movieAudioConnection enabled=\(audioConnection.isEnabled) active=\(audioConnection.isActive) " +
                    "sessionRunning=\(self.session.isRunning) " +
                    "sinceLastTapSample=\(String(format: "%.2f", sinceLastTapSample))s"
                )
            } else {
                print("[RecordingHealthCheck] t=\(String(format: "%.1f", elapsed))s movieAudioConnection MISSING")
            }
        }
        timer.resume()
        recordingDiagnosticsTimer = timer
    }

    private func stopRecordingDiagnosticsTimer() {
        recordingDiagnosticsTimer?.cancel()
        recordingDiagnosticsTimer = nil
    }

    private override init() {
        super.init()
        // The app owns AVAudioSession because recording, playback routing, and
        // live pitch tracking all share it. If AVCaptureSession auto-configures
        // it during startRunning(), iOS strips our mix/A2DP/AirPlay options and
        // long movie recordings can finalize with audioTrackCount=0 while the
        // capture connection still reports enabled/active.
        session.automaticallyConfiguresApplicationAudioSession = false
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSessionWasInterrupted(_:)),
            name: .AVCaptureSessionWasInterrupted,
            object: session
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSessionInterruptionEnded),
            name: .AVCaptureSessionInterruptionEnded,
            object: session
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSessionRuntimeError(_:)),
            name: .AVCaptureSessionRuntimeError,
            object: session
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMediaServicesWereReset),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: nil
        )
        // AVAudioSession interruptions (phone call, Siri, alarm, another app
        // requesting audio focus) do NOT necessarily stop AVCaptureSession —
        // video keeps "running" while the mic silently produces nothing until
        // the AVAudioSession is explicitly reactivated. This is the #1 cause of
        // "camera fine, microphone dead until app restart".
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioSessionInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAudioRouteChange(_:)),
            name: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance()
        )
        // Diagnostic only (reported "quality degrades after extended use" has
        // no confirmed root cause yet) — surfaces thermal throttling in the
        // Xcode console so a repro session tells us whether the OS is
        // silently dropping frame rate/format under thermal pressure, without
        // guessing at a fix blind.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleThermalStateChange),
            name: ProcessInfo.thermalStateDidChangeNotification,
            object: nil
        )
    }

    @objc private func handleThermalStateChange() {
        let state: String
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: state = "nominal"
        case .fair: state = "fair"
        case .serious: state = "serious"
        case .critical: state = "critical"
        @unknown default: state = "unknown"
        }
        print("[CameraQuality] thermalState changed -> \(state)")
        logActiveFormatDiagnostics(reason: "thermalStateChange:\(state)")
    }

    /// Diagnostic snapshot of the live format/AF-AE state — call after any
    /// suspected quality change to compare against a healthy baseline.
    private func logActiveFormatDiagnostics(reason: String) {
        sessionQueue.async { [weak self] in
            guard let self = self, let input = self.session.inputs.compactMap({ $0 as? AVCaptureDeviceInput }).first(where: { $0.device.hasMediaType(.video) }) else {
                return
            }
            let device = input.device
            let dims = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
            print(
                "[CameraQuality][\(reason)] format=\(dims.width)x\(dims.height)" +
                " minFrameDuration=\(device.activeVideoMinFrameDuration.seconds)" +
                " focusMode=\(device.focusMode.rawValue) exposureMode=\(device.exposureMode.rawValue)" +
                " lowLightBoostActive=\(device.isLowLightBoostSupported ? String(device.isLowLightBoostEnabled) : "unsupported")"
            )
        }
    }

    @objc private func handleAppDidBecomeActive() {
        // AVFoundation auto-resumes the session after interruptions, but the
        // preview layer can come back frozen — re-attach it defensively.
        if isPreviewActive {
            refreshPreviewOnMainIfNeeded()
        }
        ensureSessionHealthy(reason: "appDidBecomeActive")
    }

    @objc private func handleSessionWasInterrupted(_ notification: Notification) {
        let reasonValue = (notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? NSNumber)?.intValue
        print("[NativeCameraRecovery] session interrupted, reason=\(reasonValue ?? -1)")
    }

    @objc private func handleSessionInterruptionEnded() {
        print("[NativeCameraRecovery] session interruption ended — verifying session health")
        ensureSessionHealthy(reason: "interruptionEnded")
    }

    @objc private func handleSessionRuntimeError(_ notification: Notification) {
        let error = notification.userInfo?[AVCaptureSessionErrorKey] as? NSError
        print("[NativeCameraRecovery] session runtime error: \(error?.localizedDescription ?? "unknown")")
        // A runtime error (e.g. .mediaServicesWereReset, media contention) leaves
        // the session in an unusable state — force a full teardown/rebuild next
        // time something needs it, then try to recover immediately if we should
        // currently be showing a preview/recording.
        needsFullReconfigureAfterMediaReset = true
        ensureSessionHealthy(reason: "runtimeError")
    }

    @objc private func handleMediaServicesWereReset() {
        print("[NativeCameraRecovery] AVAudioSession media services were reset — full session rebuild required")
        needsFullReconfigureAfterMediaReset = true
        ensureSessionHealthy(reason: "mediaServicesWereReset")
    }

    @objc private func handleAudioSessionInterruption(_ notification: Notification) {
        let typeRaw = (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? NSNumber)?.uintValue
        let type = typeRaw.flatMap { AVAudioSession.InterruptionType(rawValue: $0) }
        print("[NativeCameraRecovery] AVAudioSession interruption type=\(String(describing: type))")
        // Reapply on BOTH began and ended: "began" already means the mic is
        // dead (something else took the audio session) even before iOS tells
        // us it's over, and reapplying here — while it may get pre-empted
        // again immediately — costs nothing. "ended" is the normal recovery
        // point once the other audio session backs off.
        ensureSessionHealthy(reason: type == .began ? "audioInterruptionBegan" : "audioInterruptionEnded")
    }

    @objc private func handleAudioRouteChange(_ notification: Notification) {
        let reasonRaw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        let reason = reasonRaw.flatMap { AVAudioSession.RouteChangeReason(rawValue: $0) }
        print("[NativeCameraRecovery] AVAudioSession route change reason=\(String(describing: reason))")
        sessionQueue.async { [weak self] in
            guard let self = self, self.isRecording || self.isStarting else { return }
            // The audio-only writer has no movie connection to repair. Reapplying
            // preferred input while it is writing needlessly churns the capture
            // route and can interrupt a hands-free take.
            guard !self.isAudioOnlyRecording else { return }
            self.recoverMovieAudioDuringRecording(reason: "routeChange.\(String(describing: reason))")
        }
    }

    /// Best-effort flag for lifecycle guards (AppDelegate, background suspend).
    var isNativeRecordingActive: Bool {
        isRecording || isStarting || isAudioOnlyRecording
    }

    var isAudioOnlyRecordingActive: Bool {
        isAudioOnlyRecording
    }

    /// Defensive resync used after any interruption/error/lifecycle event: if the
    /// session SHOULD be running (preview, bridge preview, or recording was
    /// active) but AVFoundation left it stopped — or hardware objects were
    /// invalidated by a media-services reset — rebuild and restart it. Cheap and
    /// idempotent when everything is already healthy, so callers can invoke it
    /// freely from any lifecycle hook.
    func ensureSessionHealthy(reason: String, completion: (() -> Void)? = nil) {
        sessionQueue.async { [weak self] in
            defer { completion?() }
            guard let self = self else { return }

            // Hands-free in Tools owns the audio-only capture session without a
            // tuner monitor, so `isTunerMonitorActive` alone left that path with
            // NO self-heal at all: after an alarm or call interrupted the
            // session, nothing here would run and the tuner/hands-free mic
            // stayed dead until the app was restarted.
            if CameraSessionGuard.recordingMode == "audio"
                && !self.isTunerMonitorActive
                && !self.isAudioOnlyRecording {
                return
            }

            let shouldBeActive =
                self.isPreviewActive ||
                self.isBridgePreviewActive ||
                self.isRecording ||
                self.isAudioOnlyRecording ||
                self.isTunerMonitorActive
            guard shouldBeActive else { return }

            // Playback owns the AVAudioSession speaker route. Defer all health
            // work until playback ends — restarting or reconfiguring the capture
            // session mid-playback causes visible preview glitches on the JPEG
            // bridge. A brief hold on the last frame during a quick take preview
            // is preferable to stuttery recovery.
            // An audio-only capture (the tuner, hands-free's pre-roll) has no
            // preview to glitch, and the native metronome holds this same
            // playback route for as long as it runs — and past it, since
            // nothing clears the flag when the click stops. Deferring for it
            // left the tuner and hands-free with no self-heal at all once the
            // click had played.
            let capturesVideo = self.isPreviewActive || self.isBridgePreviewActive ||
                ((self.isRecording || self.isStarting) && !self.isAudioOnlyRecording)
            if CameraSessionGuard.playbackRouteActive && capturesVideo {
                self.deferredHealthCheckReason = reason
                return
            }

            if self.isRecording || self.isStarting || self.isAudioOnlyRecording {
                // Never tear down capture inputs/outputs mid-recording, but DO
                // recover the movie audio connection and reactivate AVAudioSession
                // input-only — interruptions/route changes can leave video writing
                // while the audio connection is silently disabled. The hands-free
                // pre-roll is a live audio-only capture and gets the same
                // non-destructive treatment: rebuilding under it would drop the
                // file the next take is about to be promoted from.
                self.recoverMovieAudioDuringRecording(reason: reason)
                return
            }

            if reason == "js-request",
               self.session.isRunning,
               self.isSessionConfigured,
               !self.needsFullReconfigureAfterMediaReset,
               !self.needsAudioPipelineRebuild,
               (!self.isBridgePreviewActive || CACurrentMediaTime() - self.lastBridgeFrameTime < 2.5),
               (!self.isTunerMonitorActive || (self.lastAudioTapSampleTime > 0 && CACurrentMediaTime() - self.lastAudioTapSampleTime < 2.5)) {
                return
            }

            // Always reapply the AVAudioSession category/route for our active
            // profile. This is NOT the expensive part — AppDelegate already
            // force-reactivates a generic session on every single foreground
            // event unconditionally, so this costs nothing extra beyond
            // stomping that generic session back to the profile we actually
            // need. Skipping this when `session.isRunning` merely LOOKS fine
            // is exactly how a pure AVAudioSession interruption (phone call,
            // Siri, another app's audio) leaves the mic silently dead while
            // the capture session itself keeps reporting isRunning == true.
            do {
                try self.configureAudioSessionForRecording(
                    profile: self.activeAudioProfile,
                    micInputPreference: self.activeMicInputPreference
                )
            } catch {
                print("[NativeCameraRecovery][\(reason)] failed to reapply audio session: \(error.localizedDescription)")
            }

            // The heavier recovery below (rebuild/restart/preview reattach) is
            // real, visible work — only do it when the capture session itself
            // is actually broken.
            let isHealthy =
                self.session.isRunning &&
                self.isSessionConfigured &&
                !self.needsFullReconfigureAfterMediaReset &&
                !self.needsAudioPipelineRebuild &&
                (
                    !self.isTunerMonitorActive ||
                    (
                        self.lastAudioTapSampleTime > 0 &&
                        CACurrentMediaTime() - self.lastAudioTapSampleTime < 2.5
                    )
                )
            if isHealthy {
                self.consecutiveRecoveryAttempts = 0
                return
            }

            let now = CACurrentMediaTime()
            let backoff = self.recoveryBackoffInterval(for: self.consecutiveRecoveryAttempts)
            if self.consecutiveRecoveryAttempts > 0,
               now - self.lastRecoveryAttemptAt < backoff {
                return
            }
            self.consecutiveRecoveryAttempts += 1
            self.lastRecoveryAttemptAt = now

            print("[NativeCameraRecovery][\(reason)] session unhealthy — running recovery attempt \(self.consecutiveRecoveryAttempts) (isRunning=\(self.session.isRunning) configured=\(self.isSessionConfigured) needsRebuild=\(self.needsFullReconfigureAfterMediaReset))")

            if self.isTunerMonitorActive &&
                (self.needsFullReconfigureAfterMediaReset || self.needsAudioPipelineRebuild || !self.isSessionConfigured) {
                do {
                    try self.configureAudioOnlyCaptureSession()
                    self.needsAudioPipelineRebuild = false
                    self.needsFullReconfigureAfterMediaReset = false
                } catch {
                    print("[NativeTunerMonitor][\(reason)] rebuild failed: \(error.localizedDescription)")
                    return
                }
            } else if self.needsFullReconfigureAfterMediaReset || self.needsAudioPipelineRebuild || !self.isSessionConfigured {
                print("[NativeCameraRecovery][\(reason)] rebuilding capture session from scratch")
                do {
                    let configuredOutput = try self.configureCaptureSession(useFrontCamera: self.previewUsesFrontCamera)
                    self.movieOutput = configuredOutput
                    self.isSessionConfigured = true
                    self.needsAudioPipelineRebuild = false
                    self.needsFullReconfigureAfterMediaReset = false
                } catch {
                    print("[NativeCameraRecovery][\(reason)] rebuild failed: \(error.localizedDescription)")
                    return
                }
            }

            if !self.session.isRunning {
                print("[NativeCameraRecovery][\(reason)] restarting stopped capture session")
                self.session.startRunning()
            }

            if self.isPreviewActive {
                self.resetVideoZoomIfNeeded(useFrontCamera: self.previewUsesFrontCamera)
                self.refreshPreviewOnMainIfNeeded()
            }
            if self.isBridgePreviewActive {
                self.enableFrameBridge()
            }
        }
    }

    /// Delay before the next automatic recovery, given how many in a row have
    /// already failed. First retry is immediate; the rest widen to a ceiling so
    /// a session that cannot be repaired costs a couple of rebuilds a minute
    /// instead of hundreds a second.
    private func recoveryBackoffInterval(for attempts: Int) -> CFTimeInterval {
        switch attempts {
        case 0: return 0
        case 1: return 0.75
        case 2: return 1.5
        case 3: return 3
        case 4: return 6
        case 5: return 12
        default: return 30
        }
    }

    /// Called once review playback releases AVAudioSession ownership
    /// (`CameraSessionGuard.setPlaybackRouteActive(false)`). Replays whatever
    /// health check was deferred while playback owned the session, so a
    /// media reset / runtime error that happened mid-playback still gets
    /// recovered — just after playback is done with the session, not during.
    func runDeferredHealthCheckIfNeeded() {
        sessionQueue.async { [weak self] in
            guard let self = self, let reason = self.deferredHealthCheckReason else { return }
            self.deferredHealthCheckReason = nil
            print("[NativeCameraRecovery] replaying deferred health check (\(reason)) after playback released the session")
            self.ensureSessionHealthy(reason: "\(reason)+afterPlaybackReleased")
        }
    }

    private func takesDirectoryURL() throws -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let takesDir = docs.appendingPathComponent("takes", isDirectory: true)
        try FileManager.default.createDirectory(at: takesDir, withIntermediateDirectories: true)
        return takesDir
    }

    private func configureAudioSessionForRecording(
        profile: NativeCameraAudioSessionProfile,
        micInputPreference: AudioRouteConfigurator.MicInputPreference = .auto
    ) throws {
        activeAudioProfile = profile
        activeMicInputPreference = micInputPreference
        let session = AVAudioSession.sharedInstance()
        try profile.apply(to: session, micInputPreference: micInputPreference)

        // videoRecording profile already pins built-in mic for split-route capture.
        // Re-applying .headphone when HFP is unavailable falls back to Auto and
        // can reopen Bluetooth HFP on the next capture-session reconfigure.
        switch micInputPreference {
        case .iphone:
            _ = try AudioRouteConfigurator.applyMicInputPreference(.iphone, session: session)
        case .headphone:
            let headphoneInputPorts: Set<AVAudioSession.Port> = [
                .bluetoothHFP,
                .bluetoothLE,
                .headsetMic,
            ]
            let hasHeadphoneInput = (session.availableInputs ?? []).contains {
                headphoneInputPorts.contains($0.portType)
            }
            if hasHeadphoneInput {
                _ = try AudioRouteConfigurator.applyMicInputPreference(.headphone, session: session)
            }
        case .auto:
            break
        }

        _ = NativeCameraTestAudio.sessionDiagnostics(profile: profile)
        applyPadAudioInputOrientation()
    }

    /// iPad mics are directional. If AVAudioSession still thinks the device is
    /// portrait while the player has it on a stand in landscape, the chosen
    /// polar pattern points at the table instead of the instrument.
    private func applyPadAudioInputOrientation() {
        guard isPad else { return }
        let stereo: AVAudioSession.StereoOrientation
        switch cachedInterfaceOrientation {
        case .landscapeLeft:
            stereo = .landscapeLeft
        case .landscapeRight:
            stereo = .landscapeRight
        case .portraitUpsideDown:
            stereo = .portraitUpsideDown
        default:
            stereo = .portrait
        }
        if lastPadInputOrientation == stereo { return }
        do {
            try AVAudioSession.sharedInstance().setPreferredInputOrientation(stereo)
            lastPadInputOrientation = stereo
        } catch {
            print("[PitchTap] preferred input orientation failed: \(error.localizedDescription)")
        }
    }

    // UIKit is sampled on the main thread. Capture configuration reads this
    // snapshot without synchronously dispatching back from the session queue.
    private var cachedInterfaceOrientation: UIInterfaceOrientation {
        interfaceOrientationLock.lock()
        defer { interfaceOrientationLock.unlock() }
        return padInterfaceOrientation
    }

    private var captureVideoOrientation: AVCaptureVideoOrientation {
        guard isPad else { return .portrait }
        return AVCaptureVideoOrientation(rawValue: cachedInterfaceOrientation.rawValue) ?? .portrait
    }

    private func updatePadCaptureOrientation() {
        guard isPad else { return }
        let interfaceOrientation = Self.currentInterfaceOrientation()
        interfaceOrientationLock.lock()
        let changed = padInterfaceOrientation != interfaceOrientation
        padInterfaceOrientation = interfaceOrientation
        interfaceOrientationLock.unlock()
        let orientation = captureVideoOrientation
        if let connection = previewLayer?.connection, connection.isVideoOrientationSupported,
           connection.videoOrientation != orientation {
            connection.videoOrientation = orientation
        }
        guard changed else { return }
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            self.applyPadAudioInputOrientation()
            if let connection = self.videoDataOutput?.connection(with: .video), connection.isVideoOrientationSupported {
                connection.videoOrientation = orientation
            }
            // A movie keeps the orientation it started with. Preview and controls
            // can rotate mid-take without changing the movie's track matrix.
            if self.movieOutput?.isRecording != true && self.startCompletion == nil,
               let connection = self.movieOutput?.connection(with: .video), connection.isVideoOrientationSupported {
                connection.videoOrientation = orientation
            }
        }
    }

    private static func currentInterfaceOrientation() -> UIInterfaceOrientation {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
        if let orientation = scenes.first?.interfaceOrientation, orientation != .unknown {
            return orientation
        }
        return .portrait
    }

    /// Pitch needs this output more than the JPEG preview pump does. iPad's
    /// 1080p movie + video-data combo can exhaust `canAddOutput` if the tap
    /// is attached last, which left the widget with no native audio at all.
    @discardableResult
    private func addAudioTapOutput(to session: AVCaptureSession) -> Bool {
        let audioTapOutput = AVCaptureAudioDataOutput()
        audioTapOutput.setSampleBufferDelegate(self, queue: audioTapQueue)
        guard session.canAddOutput(audioTapOutput) else {
            audioDataOutput = nil
            print("[PitchTap] audio data output UNAVAILABLE — canAddOutput=false. Pitch widget will have no native audio source.")
            AudioRouteConfigurator.debugCaptureEvent(
                "NativeCameraRecordingEngine.addAudioTapOutput.unavailable"
            )
            return false
        }
        session.addOutput(audioTapOutput)
        audioDataOutput = audioTapOutput
        if let connection = audioTapOutput.connection(with: .audio) {
            connection.isEnabled = true
        }
        print("[PitchTap] audio data output ADDED to capture session")
        return true
    }

    private func preferredAudioCaptureDevice() -> AVCaptureDevice? {
        switch activeMicInputPreference {
        case .iphone:
            if let builtIn = AVCaptureDevice.default(.builtInMicrophone, for: .audio, position: .unspecified) {
                return builtIn
            }
        case .auto, .headphone:
            break
        }
        return AVCaptureDevice.default(for: .audio)
    }

    private func restoreAudioSessionAfterTest() {
        do {
            try AudioRouteConfigurator.applyRecordingRoute(
                enableHQ: AudioRouteConfigurator.shouldUseHighQualityRoute()
            )
        } catch {
            print("[NativeCameraTest] failed to restore recording route: \(error.localizedDescription)")
        }
    }

    private func requestMediaAccess(
        mediaType: AVMediaType,
        completion: @escaping (Bool) -> Void
    ) {
        switch AVCaptureDevice.authorizationStatus(for: mediaType) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: mediaType, completionHandler: completion)
        default:
            completion(false)
        }
    }

    private func requestCaptureAccess(completion: @escaping (Result<Void, Error>) -> Void) {
        requestMediaAccess(mediaType: .video) { [weak self] videoGranted in
            guard let self = self else { return }
            guard videoGranted else {
                completion(.failure(NSError(
                    domain: "NativeCameraTest",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Camera permission denied"]
                )))
                return
            }

            self.requestMediaAccess(mediaType: .audio) { audioGranted in
                guard audioGranted else {
                    completion(.failure(NSError(
                        domain: "NativeCameraTest",
                        code: 2,
                        userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied"]
                    )))
                    return
                }

                completion(.success(()))
            }
        }
    }

    var requiresActiveAudioSession: Bool {
        session.isRunning && (
            isBridgePreviewActive ||
            isPreviewActive ||
            isRecording ||
            isStarting ||
            isAudioOnlyRecording
        )
    }

    func startBridgePreview(
        useFrontCamera: Bool,
        audioSessionProfile: NativeCameraAudioSessionProfile,
        micInputPreference: AudioRouteConfigurator.MicInputPreference = .auto,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        requestCaptureAccess { [weak self] accessResult in
            guard let self = self else { return }
            switch accessResult {
            case .failure(let error):
                completion(.failure(error))
            case .success:
                self.sessionQueue.async {
                    MetronomeEngine.shared.pauseOutputForCaptureHandoff()
                    do {
                        let resolvedProfile = CameraSessionGuard.recordingMode == "audio" ? .playAndRecordDefault : audioSessionProfile
                        try self.configureAudioSessionForRecording(
                            profile: resolvedProfile,
                            micInputPreference: micInputPreference
                        )
                        // Rebuild the capture session if needed. The explicit
                        // needsAudioPipelineRebuild flag is set whenever the bridge/
                        // preview is stopped for app-background. It is more reliable
                        // than checking !session.isRunning because stopRunning() is
                        // dispatched asynchronously on sessionQueue — the flag is set
                        // synchronously on the tear-down path so it is always true by
                        // the time this start path runs on the same queue.
                        if !self.isSessionConfigured || self.movieOutput == nil || self.previewUsesFrontCamera != useFrontCamera || self.needsAudioPipelineRebuild {
                            let configuredOutput = try self.configureCaptureSession(useFrontCamera: useFrontCamera)
                            self.movieOutput = configuredOutput
                            self.isSessionConfigured = true
                            self.needsAudioPipelineRebuild = false
                        }
                        self.previewUsesFrontCamera = useFrontCamera
                        if !self.session.isRunning {
                            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startBridgePreview startRunning.begin")
                            self.session.startRunning()
                            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startBridgePreview startRunning.end")
                        }
                        self.resetVideoZoomIfNeeded(useFrontCamera: useFrontCamera)
                        self.enableFrameBridge()
                        self.isBridgePreviewActive = true
                        self.isPreviewActive = false
                        CameraSessionGuard.setPreviewActive(true)
                        MetronomeEngine.shared.resumeOutputAfterCaptureHandoff()
                        let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: audioSessionProfile)
                        DispatchQueue.main.async {
                            completion(.success(sessionInfo))
                        }
                    } catch {
                        MetronomeEngine.shared.resumeOutputAfterCaptureHandoff()
                        DispatchQueue.main.async {
                            completion(.failure(error))
                        }
                    }
                }
            }
        }
    }

    func stopBridgePreview(completion: (() -> Void)? = nil) {
        isBridgePreviewActive = false
        if !isRecording && !isPreviewActive {
            CameraSessionGuard.setPreviewActive(false)
        }
        // Mark that the audio pipeline will need a full rebuild on the next
        // start. The shared AVAudioSession is deactivated by AppDelegate on
        // app-background, which leaves any still-registered AVCaptureDeviceInput
        // in a stale state. We detect this explicitly here rather than relying
        // on session.isRunning (which can still be true momentarily because the
        // sessionQueue processes stopRunning() asynchronously after this call).
        if !isRecording {
            needsAudioPipelineRebuild = true
        }
        stopPreview(completion: completion)
    }

    func startPreview(
        in container: UIView,
        useFrontCamera: Bool,
        audioSessionProfile: NativeCameraAudioSessionProfile,
        micInputPreference: AudioRouteConfigurator.MicInputPreference = .auto,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        requestCaptureAccess { [weak self, weak container] accessResult in
            guard let self = self else { return }
            switch accessResult {
            case .failure(let error):
                completion(.failure(error))
            case .success:
                self.sessionQueue.async {
                    do {
                        let resolvedProfile = CameraSessionGuard.recordingMode == "audio" ? .playAndRecordDefault : audioSessionProfile
                        try self.configureAudioSessionForRecording(
                            profile: resolvedProfile,
                            micInputPreference: micInputPreference
                        )
                        // See startBridgePreview: use the explicit needsAudioPipelineRebuild
                        // flag rather than !session.isRunning for the same reasons.
                        if !self.isSessionConfigured || self.movieOutput == nil || self.previewUsesFrontCamera != useFrontCamera || self.needsAudioPipelineRebuild {
                            self.movieOutput = try self.configureCaptureSession(useFrontCamera: useFrontCamera)
                            self.isSessionConfigured = true
                            self.needsAudioPipelineRebuild = false
                        }
                        self.previewUsesFrontCamera = useFrontCamera
                        if !self.session.isRunning {
                            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startPreview startRunning.begin")
                            self.session.startRunning()
                            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startPreview startRunning.end")
                        }
                        self.resetVideoZoomIfNeeded(useFrontCamera: useFrontCamera)
                        // Layer preview is the display path — the JPEG pump only runs
                        // while a JS consumer explicitly asks for frames.
                        if !self.isFrameBridgeExternallyRequested {
                            self.disableFrameBridge()
                        }
                        CameraSessionGuard.setPreviewActive(true)
                        let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: audioSessionProfile)
                        // Let the capture pipeline deliver frames before exposing preview.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
                            guard let self = self else { return }
                            if let container = container {
                                self.attachPreviewLayer(to: container)
                                self.isPreviewActive = true
                                self.isBridgePreviewActive = false
                                self.layoutPreview(in: container)
                            }
                            completion(.success(sessionInfo))
                        }
                    } catch {
                        DispatchQueue.main.async {
                            completion(.failure(error))
                        }
                    }
                }
            }
        }
    }

    func stopPreview(completion: (() -> Void)? = nil) {
        disableFrameBridge()
        isFrameBridgeExternallyRequested = false
        isBridgePreviewActive = false
        if !isRecording {
            CameraSessionGuard.setPreviewActive(false)
            needsAudioPipelineRebuild = true
        }
        DispatchQueue.main.async {
            self.previewLayer?.removeFromSuperlayer()
            self.previewLayer = nil
            self.previewContainer = nil
            self.isPreviewActive = false
        }

        sessionQueue.async {
            guard !self.isRecording else {
                DispatchQueue.main.async {
                    completion?()
                }
                return
            }
            if self.session.isRunning {
                AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.stopPreview stopRunning.begin")
                self.session.stopRunning()
                AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.stopPreview stopRunning.end")
            }

            // Hand the caller back here, not after the teardown below. Once
            // stopRunning() returns the hardware is released, which is all a
            // waiting start actually needs — and every camera start awaits this
            // resolve (see useCameraSession's release serialisation), so the
            // clearConfiguration pass below was charged straight to the black
            // screen the user sits through on a Tools → Camera round trip. It
            // still runs before any queued start: both are sessionQueue blocks,
            // and the queue is serial.
            DispatchQueue.main.async {
                completion?()
            }

            // Clear inputs and outputs when stopped to prevent zombie hardware devices
            // (like Bluetooth HFP inputs) from triggering capture session crashes
            // when the audio route changes while the preview is inactive.
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.stopPreview clearConfiguration.begin")
            self.session.beginConfiguration()
            for input in self.session.inputs {
                self.session.removeInput(input)
            }
            for output in self.session.outputs {
                self.session.removeOutput(output)
            }
            self.movieOutput = nil
            self.videoDataOutput = nil
            self.audioDataOutput = nil
            self.isSessionConfigured = false
            self.session.commitConfiguration()
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.stopPreview clearConfiguration.end")
        }
    }

    func layoutPreview(in container: UIView) {
        // The controller also lays out in Tools/audio mode, where there is no
        // preview container but the iPad microphone still needs its orientation.
        updatePadCaptureOrientation()
        guard previewContainer === container else { return }
        // bounds + position instead of frame: frame is undefined once the
        // pinch-zoom transform is applied to the layer.
        previewLayer?.bounds = container.bounds
        previewLayer?.position = CGPoint(x: container.bounds.midX, y: container.bounds.midY)
    }

    /// Preview-only pinch zoom (mirrors the CSS `--camera-preview-zoom` behavior):
    /// scales the rendered layer, never `videoZoomFactor`, so recordings stay unzoomed.
    func setPreviewZoom(_ zoom: CGFloat) {
        let clamped = max(1, min(3, zoom))
        previewZoom = clamped
        DispatchQueue.main.async {
            guard let layer = self.previewLayer else { return }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.setAffineTransform(
                clamped > 1.001 ? CGAffineTransform(scaleX: clamped, y: clamped) : .identity
            )
            CATransaction.commit()
        }
    }

    private func applyFrontCameraMirroring(to connection: AVCaptureConnection) {
        guard connection.isVideoMirroringSupported else { return }
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = true
    }

    /// Re-asserts continuous autofocus/exposure/white-balance and low-light
    /// boost. AVFoundation does not guarantee these survive every session
    /// reconfigure or a long background/foreground cycle — if the device
    /// drifts to a locked/fixed mode (or thermal throttling changes the
    /// active format), preview and recordings can look progressively softer
    /// or show motion blur without any explicit code change. Called both at
    /// initial session configure and on every preview warm so long-running
    /// sessions keep re-requesting the sharpest available mode instead of
    /// silently degrading.
    private func applyContinuousFocusAndExposure(to device: AVCaptureDevice) {
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
        if device.isExposureModeSupported(.continuousAutoExposure) {
            device.exposureMode = .continuousAutoExposure
        }
        if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
            device.whiteBalanceMode = .continuousAutoWhiteBalance
        }
        if device.isLowLightBoostSupported {
            device.automaticallyEnablesLowLightBoostWhenAvailable = true
        }
    }

    private func resetVideoZoomIfNeeded(useFrontCamera: Bool) {
        let cameraPosition: AVCaptureDevice.Position = useFrontCamera ? .front : .back
        guard let videoDevice = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: cameraPosition
        ) else {
            return
        }

        do {
            try videoDevice.lockForConfiguration()
            if videoDevice.videoZoomFactor > 1.01 {
                videoDevice.videoZoomFactor = 1.0
            }
            applyContinuousFocusAndExposure(to: videoDevice)
            videoDevice.unlockForConfiguration()
        } catch {
            /* preview may still be usable */
        }
    }

    private func attachPreviewLayer(to container: UIView) {
        previewContainer = container
        let layer: AVCaptureVideoPreviewLayer
        if let existing = previewLayer {
            layer = existing
            existing.session = session
        } else {
            layer = AVCaptureVideoPreviewLayer(session: session)
            previewLayer = layer
        }
        layer.videoGravity = .resizeAspectFill
        layer.bounds = container.bounds
        layer.position = CGPoint(x: container.bounds.midX, y: container.bounds.midY)
        if let connection = layer.connection {
            if connection.isVideoOrientationSupported {
                connection.videoOrientation = captureVideoOrientation
            }
            applyFrontCameraMirroring(to: connection)
        }
        if layer.superlayer !== container.layer {
            layer.removeFromSuperlayer()
            container.layer.insertSublayer(layer, at: 0)
        }
        if previewZoom > 1.001 {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.setAffineTransform(CGAffineTransform(scaleX: previewZoom, y: previewZoom))
            CATransaction.commit()
        }
    }

    private func refreshPreviewOnMainIfNeeded() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self, let container = self.previewContainer else { return }
            self.attachPreviewLayer(to: container)
            self.layoutPreview(in: container)
        }
    }

    func start(
        useFrontCamera: Bool,
        audioSessionProfile: NativeCameraAudioSessionProfile,
        micInputPreference: AudioRouteConfigurator.MicInputPreference = .auto,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        requestCaptureAccess { [weak self] accessResult in
            guard let self = self else { return }
            switch accessResult {
            case .failure(let error):
                completion(.failure(error))
            case .success:
                self.sessionQueue.async {
                    do {
                        let result = try self.startOnSessionQueue(
                            useFrontCamera: useFrontCamera,
                            audioSessionProfile: audioSessionProfile,
                            micInputPreference: micInputPreference,
                            completion: completion
                        )
                        print("[NativeCameraTest] start requested")
                        print("[NativeCameraTest] fileURL = \(result["fileURL"] ?? "unknown")")
                    } catch {
                        DispatchQueue.main.async {
                            completion(.failure(error))
                        }
                    }
                }
            }
        }
    }

    private func logMovieAudioConnection(context: String, movieOutput: AVCaptureMovieFileOutput) {
        if let audioConnection = movieOutput.connection(with: .audio) {
            print(
                "[NativeCameraTest][\(context)] movieAudioConnection " +
                "enabled=\(audioConnection.isEnabled) active=\(audioConnection.isActive) " +
                "inputPorts=\(audioConnection.inputPorts.map { $0.mediaType.rawValue })"
            )
        } else {
            print("[NativeCameraTest][\(context)] movieAudioConnection MISSING — movie output has no audio connection")
        }
    }

    /// Safe mid-recording recovery: never setCategory or reconfigure the capture
    /// session (that silently drops the movie audio connection), but DO re-enable
    /// a disabled connection and reactivate AVAudioSession input-only.
    private func recoverMovieAudioDuringRecording(reason: String) {
        if let movieOutput = movieOutput {
            logMovieAudioConnection(context: "recover.\(reason)", movieOutput: movieOutput)
            if let audioConnection = movieOutput.connection(with: .audio), !audioConnection.isEnabled {
                print("[NativeCameraRecovery][\(reason)] re-enabling disabled movie audio connection")
                audioConnection.isEnabled = true
            }
        }

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try AudioRouteConfigurator.ensureSessionActive(
                audioSession,
                caller: "recoverMovieAudioDuringRecording.\(reason)"
            )
            _ = try AudioRouteConfigurator.applyMicInputPreferenceInputOnly(
                activeMicInputPreference,
                caller: "recoverMovieAudioDuringRecording.\(reason)"
            )
        } catch {
            print("[NativeCameraRecovery][\(reason)] input-only session recovery failed: \(error.localizedDescription)")
        }

        if !session.isRunning {
            print("[NativeCameraRecovery][\(reason)] restarting session during active recording")
            session.startRunning()
        }
    }

    private func applyCaptureSessionPresetForDevice() {
        if isPad {
            if session.canSetSessionPreset(.hd1920x1080) {
                session.sessionPreset = .hd1920x1080
            } else {
                session.sessionPreset = .high
            }
            return
        }
        session.sessionPreset = .high
    }

    /// Pick the highest front-camera format up to 1080p with ~30fps support.
    private func preferHighestFormatWithin1080p(on device: AVCaptureDevice) {
        var bestFormat: AVCaptureDevice.Format?
        var bestPixels: Int32 = 0

        for format in device.formats {
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            guard dims.width <= 1920, dims.height <= 1920 else { continue }
            let pixels = dims.width * dims.height
            guard pixels >= 1280 * 720 else { continue }

            let supports30fps = format.videoSupportedFrameRateRanges.contains {
                $0.maxFrameRate >= 28 && $0.minFrameRate <= 32
            }
            guard supports30fps else { continue }

            if pixels > bestPixels {
                bestPixels = pixels
                bestFormat = format
            }
        }

        guard let bestFormat = bestFormat else { return }
        let dims = CMVideoFormatDescriptionGetDimensions(bestFormat.formatDescription)
        guard dims.width > 0, dims.height > 0 else { return }
        let current = CMVideoFormatDescriptionGetDimensions(device.activeFormat.formatDescription)
        guard dims.width * dims.height > current.width * current.height else { return }
        device.activeFormat = bestFormat
        print("[CameraQuality][iPad] activeFormat=\(dims.width)x\(dims.height)")
    }

    private func configureCaptureSession(useFrontCamera: Bool) throws -> AVCaptureMovieFileOutput {
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession beginConfiguration.begin")
        session.beginConfiguration()
        defer {
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession commitConfiguration.begin")
            session.commitConfiguration()
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession commitConfiguration.end")
        }

        for input in session.inputs {
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession removeInput.begin", details: "input=\(input)")
            session.removeInput(input)
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession removeInput.end", details: "input=\(input)")
        }
        for output in session.outputs {
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession removeOutput.begin", details: "output=\(output)")
            session.removeOutput(output)
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession removeOutput.end", details: "output=\(output)")
        }

        movieOutput = nil
        videoDataOutput = nil
        audioDataOutput = nil
        isSessionConfigured = false

        applyCaptureSessionPresetForDevice()

        let cameraPosition: AVCaptureDevice.Position = useFrontCamera ? .front : .back
        guard let videoDevice = AVCaptureDevice.default(
            .builtInWideAngleCamera,
            for: .video,
            position: cameraPosition
        ) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 4,
                userInfo: [NSLocalizedDescriptionKey: "Front camera unavailable"]
            )
        }

        try videoDevice.lockForConfiguration()
        videoDevice.videoZoomFactor = 1.0
        if isPad {
            preferHighestFormatWithin1080p(on: videoDevice)
        }
        applyContinuousFocusAndExposure(to: videoDevice)
        videoDevice.unlockForConfiguration()

        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession createVideoInput.begin", details: "device=\(videoDevice.localizedName)")
        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession createVideoInput.end", details: "device=\(videoDevice.localizedName)")
        guard session.canAddInput(videoInput) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 5,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add video input"]
            )
        }
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession addVideoInput.begin", details: "device=\(videoDevice.localizedName)")
        session.addInput(videoInput)
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession addVideoInput.end", details: "device=\(videoDevice.localizedName)")

        guard let audioDevice = preferredAudioCaptureDevice() else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 6,
                userInfo: [NSLocalizedDescriptionKey: "Built-in microphone unavailable"]
            )
        }

        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession createAudioInput.begin", details: "device=\(audioDevice.localizedName)")
        let audioInput = try AVCaptureDeviceInput(device: audioDevice)
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession createAudioInput.end", details: "device=\(audioDevice.localizedName)")
        guard session.canAddInput(audioInput) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 7,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add audio input"]
            )
        }
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession addAudioInput.begin", details: "device=\(audioDevice.localizedName)")
        session.addInput(audioInput)
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession addAudioInput.end", details: "device=\(audioDevice.localizedName)")

        let movieOutput = AVCaptureMovieFileOutput()
        guard session.canAddOutput(movieOutput) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 8,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add movie output"]
            )
        }
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession addMovieOutput.begin")
        session.addOutput(movieOutput)
        AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.configureCaptureSession addMovieOutput.end")

        // Pitch needs this output more than the JPEG preview pump does, so the
        // tap goes on before the video data output below. It must NOT go on
        // before the movie output above: `addAudioTapOutput` degrades quietly
        // when `canAddOutput` says no, but the movie and video-data outputs
        // both *throw*, so an optional output that takes a slot one of them
        // needs does not cost us a pitch graph — it costs the whole capture
        // session. Before iOS 16 an AVCaptureAudioDataOutput and an
        // AVCaptureMovieFileOutput could not coexist at all, and this app
        // still deploys to 15.0, so that is a live case and not a theory.
        _ = addAudioTapOutput(to: session)

        if let audioConnection = movieOutput.connection(with: .audio) {
            audioConnection.isEnabled = true
        }

        if let connection = movieOutput.connection(with: .video) {
            // Match the unmirrored live preview bridge (videoDataOutput below) —
            // the recorded file must show the same orientation the user saw
            // while recording, not a mirror-image flip.
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = false
            }
            if connection.isVideoOrientationSupported {
                connection.videoOrientation = captureVideoOrientation
            }
            if connection.isVideoStabilizationSupported {
                connection.preferredVideoStabilizationMode = .off
            }
        }

        let dimensions = CMVideoFormatDescriptionGetDimensions(videoDevice.activeFormat.formatDescription)
        recordedVideoWidth = Int(dimensions.width)
        recordedVideoHeight = Int(dimensions.height)

        let videoDataOutput = AVCaptureVideoDataOutput()
        videoDataOutput.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ]
        videoDataOutput.alwaysDiscardsLateVideoFrames = true
        videoDataOutput.setSampleBufferDelegate(self, queue: frameBridgeQueue)
        /*
         * The frame bridge is the last thing in the queue for a slot, and the
         * only one that may go without.
         *
         * An iPad running a 1080p movie file output can refuse a third output,
         * and this one is the least missed: the preview the player watches is
         * the AVCaptureVideoPreviewLayer, and this pump exists to hand JPEGs to
         * JS consumers on demand. Throwing here cost the entire capture
         * session — no preview, no recording, no tuner — to protect a pump that
         * most of the app never asks for. So it degrades instead, and the
         * mandatory movie output and the audio tap that feeds pitch both keep
         * the slots they were given above.
         */
        if session.canAddOutput(videoDataOutput) {
            session.addOutput(videoDataOutput)
            self.videoDataOutput = videoDataOutput
            if let connection = videoDataOutput.connection(with: .video) {
                if connection.isVideoOrientationSupported {
                    connection.videoOrientation = captureVideoOrientation
                }
                if connection.isVideoMirroringSupported {
                    connection.automaticallyAdjustsVideoMirroring = false
                    connection.isVideoMirrored = false
                }
            }
        } else {
            self.videoDataOutput = nil
            print("[NativeCamera] video data output UNAVAILABLE — canAddOutput=false. Layer preview only; the JPEG frame bridge is off for this session.")
            AudioRouteConfigurator.debugCaptureEvent(
                "NativeCameraRecordingEngine.configureCaptureSession videoDataOutput.unavailable"
            )
        }

        if audioDataOutput == nil {
            _ = addAudioTapOutput(to: session)
        }

        logActiveFormatDiagnostics(reason: "sessionConfigured")
        return movieOutput
    }

    func enableFrameBridge() {
        frameBridgeQueue.async {
            guard !self.isFrameBridgeActive else { return }
            self.bridgeGeneration &+= 1
            self.isFrameBridgeActive = true
            self.lastBridgeFrameTime = 0
            self.pendingBridgeSample = nil
            self.isBridgeEncoding = false
            self.bridgeFrameAwaitingAck = nil
            self.consecutiveBridgeAckTimeouts = 0
        }
    }

    /// On-demand pump control for JS consumers (multitrack stage, thumbnail capture)
    /// while the layer preview is the primary display path.
    func setFrameBridgeExternallyRequested(_ enabled: Bool) {
        isFrameBridgeExternallyRequested = enabled
        if enabled {
            enableFrameBridge()
        } else if !isBridgePreviewActive {
            disableFrameBridge()
        }
    }

    func disableFrameBridge() {
        frameBridgeQueue.async {
            self.bridgeGeneration &+= 1
            self.isFrameBridgeActive = false
            self.pendingBridgeSample = nil
            self.isBridgeEncoding = false
            self.bridgeFrameAwaitingAck = nil
            self.consecutiveBridgeAckTimeouts = 0
        }
    }

    /// The Capacitor notify call only confirms that a message was enqueued for
    /// WebKit. Wait until the JS consumer has actually received the frame before
    /// sending another large payload so IPC can never grow without bound. JS
    /// keeps only its newest pending decode, so receipt is the correct pressure
    /// boundary; waiting for decode + requestAnimationFrame adds visible latency.
    func acknowledgePreviewFrame(_ frameId: UInt64) {
        frameBridgeQueue.async {
            guard self.bridgeFrameAwaitingAck == frameId else { return }
            self.bridgeFrameAwaitingAck = nil
            self.consecutiveBridgeAckTimeouts = 0
            self.drainBridgeFrames()
        }
    }

    private func jpegPayload(from sampleBuffer: CMSampleBuffer, mirrored: Bool) -> (String, Int, Int)? {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }

        var ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        if mirrored {
            ciImage = ciImage.transformed(by: CGAffineTransform(scaleX: -1, y: 1))
                .transformed(by: CGAffineTransform(translationX: ciImage.extent.width, y: 0))
        }

        let extent = ciImage.extent
        let sourceWidth = extent.width
        let sourceHeight = extent.height
        guard sourceWidth > 0, sourceHeight > 0 else { return nil }

        let playAlongBridgeActive = isRecordingPlayAlongBridgeActive()
        let maxPixelDimension: CGFloat
        let jpegQuality: CGFloat
        if playAlongBridgeActive {
            maxPixelDimension = bridgeMaxPixelDimensionRecordingPlayAlong
            jpegQuality = bridgeJpegQualityRecordingPlayAlong
        } else {
            maxPixelDimension = bridgeMaxPixelDimension
            jpegQuality = bridgeJpegQuality
        }
        let maxDim = max(sourceWidth, sourceHeight)
        let scale = min(1, maxPixelDimension / maxDim)
        let outputWidth = Int(sourceWidth * scale)
        let outputHeight = Int(sourceHeight * scale)

        let scaledImage: CIImage
        if scale < 1 {
            scaledImage = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        } else {
            scaledImage = ciImage
        }

        let options: [CIImageRepresentationOption: Any] = [
            .init(rawValue: kCGImageDestinationLossyCompressionQuality as String): jpegQuality,
        ]
        guard let jpeg = ciContext.jpegRepresentation(
            of: scaledImage,
            colorSpace: bridgeColorSpace,
            options: options
        ) else {
            return nil
        }

        return (jpeg.base64EncodedString(), outputWidth, outputHeight)
    }

    private func startOnSessionQueue(
        useFrontCamera: Bool,
        audioSessionProfile: NativeCameraAudioSessionProfile,
        micInputPreference: AudioRouteConfigurator.MicInputPreference = .auto,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) throws -> [String: Any] {
        if isAudioOnlyRecording {
            throw NSError(
                domain: "NativeCameraTest",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Audio-only recording active"]
            )
        }
        if isRecording || isStarting {
            throw NSError(
                domain: "NativeCameraTest",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Already recording"]
            )
        }

        isStarting = true
        defer {
            if !isRecording {
                isStarting = false
            }
        }

        // Re-apply the AVAudioSession profile only when no preview is already
        // holding a live, correctly-configured capture session. Calling
        // setCategory / setActive while AVCaptureSession is running disrupts the
        // audio pipeline silently: the movie file keeps writing but the audio
        // connection drops. Layer-preview (isPreviewActive) and bridge-preview
        // (isBridgePreviewActive) both establish the correct videoRecording
        // profile in their own start paths, so we can skip this here.
        let previewAlreadyActive = (isPreviewActive || isBridgePreviewActive) && session.isRunning && isSessionConfigured
        if !previewAlreadyActive {
            try configureAudioSessionForRecording(
                profile: audioSessionProfile,
                micInputPreference: micInputPreference
            )
        } else {
            // Preview already owns a healthy capture session — a full session
            // reconfigure would silently drop the audio connection. But the mic
            // preference may have changed while the preview was live (the toggle
            // is queued/no-op during preview), so honor it here with an
            // input-only setPreferredInput that never disturbs capture.
            activeAudioProfile = audioSessionProfile
            let micPreferenceChanged = activeMicInputPreference != micInputPreference
            activeMicInputPreference = micInputPreference
            do {
                if micPreferenceChanged {
                    _ = try AudioRouteConfigurator.applyMicInputPreferenceInputOnly(
                        micInputPreference,
                        caller: "startOnSessionQueue.previewActive"
                    )
                }
            } catch {
                print("[MicRouteProof] context=startOnSessionQueue.previewActive inputOnly apply failed: \(error.localizedDescription)")
            }
        }

        let needsCaptureReconfigure =
            !isSessionConfigured ||
            movieOutput == nil ||
            needsAudioPipelineRebuild ||
            (!previewAlreadyActive && previewUsesFrontCamera != useFrontCamera)
        if needsCaptureReconfigure {
            // Rebuild a known stale audio pipeline before opening the movie.
            // A live video preview alone does not prove the microphone is healthy.
            if previewAlreadyActive && !needsAudioPipelineRebuild && movieOutput != nil {
                print("[NativeCameraTest] preserving healthy preview capture session")
            } else {
                let configuredOutput = try configureCaptureSession(useFrontCamera: useFrontCamera)
                movieOutput = configuredOutput
                isSessionConfigured = true
                previewUsesFrontCamera = useFrontCamera
                needsAudioPipelineRebuild = false
            }
        }

        if !session.isRunning {
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startOnSessionQueue startRunning.begin")
            session.startRunning()
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startOnSessionQueue startRunning.end")
        }

        // In layer-preview mode the pump only runs when a JS consumer asked for it.
        if isBridgePreviewActive || isFrameBridgeExternallyRequested {
            enableFrameBridge()
        }
        previewUsesFrontCamera = useFrontCamera

        let takesDir = try takesDirectoryURL()
        let timestamp = Int(Date().timeIntervalSince1970 * 1000)
        let filename = "native-camera-test-\(timestamp).mp4"
        let fileURL = takesDir.appendingPathComponent(filename)
        guard let audioConnection = movieOutput?.connection(with: .audio) else {
            throw NSError(domain: "NativeCameraTest", code: 14, userInfo: [
                NSLocalizedDescriptionKey: "The microphone is unavailable. Reconnect your headphones and try again."
            ])
        }
        audioConnection.isEnabled = true
        outputURL = fileURL
        beginAudioFallbackCapture(for: fileURL)

        let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: audioSessionProfile)
        let route = sessionInfo["outputRoute"] as? String ?? "unknown"
        let inputRoute = sessionInfo["inputRoute"] as? String ?? "unknown"

        print("[NativeCameraTest] session started")
        guard let activeMovieOutput = movieOutput else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 9,
                userInfo: [NSLocalizedDescriptionKey: "Movie output unavailable"]
            )
        }

        if let connection = activeMovieOutput.connection(with: .video), connection.isVideoOrientationSupported {
            connection.videoOrientation = captureVideoOrientation
        }
        logMovieAudioConnection(context: "recordStart", movieOutput: activeMovieOutput)

        var result: [String: Any] = [
            "filePath": "takes/\(filename)",
            "fileURL": fileURL.absoluteString,
            "route": route,
            "inputRoute": inputRoute,
            "width": recordedVideoWidth,
            "height": recordedVideoHeight,
            "audioSessionProfile": audioSessionProfile.rawValue,
        ]
        for (key, value) in sessionInfo {
            result[key] = value
        }

        startCompletion = completion
        pendingStartResult = result
        activeMovieOutput.startRecording(to: fileURL, recordingDelegate: self)
        refreshPreviewOnMainIfNeeded()

        return result
    }

    func stop(trimStartMs: Int = 0, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            if self.isAudioOnlyRecording {
                DispatchQueue.main.async {
                    completion(.failure(NSError(
                        domain: "NativeCameraTest",
                        code: 12,
                        userInfo: [NSLocalizedDescriptionKey: "Audio-only recording active — use stopAudioRecording"]
                    )))
                }
                return
            }
            self.pendingTrimStartMs = trimStartMs

            guard (self.isRecording || self.isStarting), let movieOutput = self.movieOutput else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(
                        domain: "NativeCameraTest",
                        code: 10,
                        userInfo: [NSLocalizedDescriptionKey: "Not recording"]
                    )))
                }
                return
            }

            self.stopCompletion = completion
            guard movieOutput.isRecording else {
                self.stopCompletion = nil
                self.isStarting = false
                DispatchQueue.main.async {
                    completion(.failure(NSError(
                        domain: "NativeCameraTest",
                        code: 11,
                        userInfo: [NSLocalizedDescriptionKey: "Recording has not started yet"]
                    )))
                }
                return
            }
            self.stopProcessingStartedAt = CACurrentMediaTime()
            self.logStopStage("stop-requested")
            movieOutput.stopRecording()
        }
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            self.isRecording = true
            self.isStarting = false
            self.startRecordingDiagnosticsTimer()

            let completion = self.startCompletion
            let result = self.pendingStartResult
            self.startCompletion = nil
            self.pendingStartResult = nil

            print("[NativeCameraTest] recording started")
            print("[NativeCameraTest] fileURL = \(fileURL.absoluteString)")
            if let movieOutput = self.movieOutput {
                self.logMovieAudioConnection(context: "didStartRecording", movieOutput: movieOutput)
            }
            for connection in connections where connection.isActive {
                if connection.inputPorts.contains(where: { $0.mediaType == .audio }) {
                    print(
                        "[NativeCameraTest][didStartRecording] active audio connection " +
                        "enabled=\(connection.isEnabled) active=\(connection.isActive)"
                    )
                }
            }
            AudioRouteConfigurator.logMicRouteProof(
                context: "recordingStarted",
                preference: self.activeMicInputPreference
            )

            DispatchQueue.main.async {
                if let result = result {
                    completion?(.success(result))
                }
                self.refreshPreviewOnMainIfNeeded()
            }
        }
    }

    func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            self.isRecording = false
            self.isStarting = false
            self.logStopStage("writer-finished")
            self.stopRecordingDiagnosticsTimer()
            if self.isBridgePreviewActive || self.isFrameBridgeExternallyRequested {
                self.enableFrameBridge()
            } else {
                self.disableFrameBridge()
            }
            let startCompletion = self.startCompletion
            self.startCompletion = nil
            self.pendingStartResult = nil

            if self.session.isRunning && !self.isPreviewActive && !self.isBridgePreviewActive {
                AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.didFinishRecording stopRunning.begin")
                self.session.stopRunning()
                AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.didFinishRecording stopRunning.end")
            }

            let completion = self.stopCompletion
            self.stopCompletion = nil

            if let error = error {
                print("[NativeCameraTest] recording stopped with error: \(error.localizedDescription)")
                self.restoreAudioSessionAfterTest()
                DispatchQueue.main.async {
                    startCompletion?(.failure(error))
                    completion?(.failure(error))
                }
                return
            }

            let trimStartMs = self.pendingTrimStartMs
            self.pendingTrimStartMs = 0

            self.finishAudioFallbackCapture { fallbackAudioURL, fallbackSampleCount in
                self.sessionQueue.async {
                    if fallbackSampleCount > 0 {
                        print("[NativeCameraTest] fallback audio captured samples=\(fallbackSampleCount) url=\(fallbackAudioURL?.absoluteString ?? "none")")
                    } else {
                        print("[NativeCameraTest] fallback audio captured no samples")
                    }
                    self.finishStopPostProcessing(
                        outputFileURL: outputFileURL,
                        trimStartMs: trimStartMs,
                        fallbackAudioURL: fallbackAudioURL,
                        completion: completion
                    )
                }
            }
        }
    }

    private func finishStopPostProcessing(
        outputFileURL: URL,
        trimStartMs: Int,
        fallbackAudioURL: URL?,
        completion: ((Result<[String: Any], Error>) -> Void)?
    ) {
        let muxFallbackAndFinalize: () -> Void = {
            self.logStopStage("trim-finished-or-skipped")
            self.muxFallbackAudioIfNeeded(
                into: outputFileURL,
                fallbackAudioURL: fallbackAudioURL,
                audioTrimStartMs: trimStartMs
            ) { muxResult in
                self.sessionQueue.async {
                    if case .failure(let muxError) = muxResult {
                        print("[NativeCameraTest] fallback audio mux failed: \(muxError.localizedDescription). Keeping original video.")
                    }
                    self.logStopStage("audio-recovery-finished-or-skipped")
                    self.finalizeStopResult(for: outputFileURL, completion: completion)
                }
            }
        }

        if trimStartMs > 0 {
            trimVideo(sourceURL: outputFileURL, trimStartMs: trimStartMs) { trimResult in
                self.sessionQueue.async {
                    switch trimResult {
                    case .success(let trimmedURL):
                        do {
                            try FileManager.default.removeItem(at: outputFileURL)
                            try FileManager.default.moveItem(at: trimmedURL, to: outputFileURL)
                            muxFallbackAndFinalize()
                        } catch {
                            self.restoreAudioSessionAfterTest()
                            DispatchQueue.main.async {
                                completion?(.failure(error))
                            }
                        }
                    case .failure(let trimError):
                        print("[NativeCameraTest] Trim failed: \(trimError.localizedDescription). Falling back to untrimmed.")
                        muxFallbackAndFinalize()
                    }
                }
            }
        } else {
            muxFallbackAndFinalize()
        }
    }

    private func beginAudioFallbackCapture(for movieURL: URL) {
        let fallbackURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("native-camera-audio-\(UUID().uuidString).m4a")

        audioTapQueue.async {
            self.audioFallbackWriter?.cancelWriting()
            if let oldURL = self.audioFallbackURL {
                try? FileManager.default.removeItem(at: oldURL)
            }
            try? FileManager.default.removeItem(at: fallbackURL)
            self.audioFallbackWriter = nil
            self.audioFallbackInput = nil
            self.audioFallbackURL = fallbackURL
            self.audioFallbackCaptureActive = true
            self.audioFallbackStarted = false
            self.audioFallbackSampleCount = 0
            self.multitrackFirstAudioSampleHostTimeSec = nil
            self.multitrackPerformanceAnchorHostTimeSec = nil
            self.multitrackPerformanceFileTimeSec = nil
            print("[NativeCameraTest] fallback audio armed for \(movieURL.lastPathComponent)")
        }
    }

    private func finishAudioFallbackCapture(completion: @escaping (_ audioURL: URL?, _ sampleCount: Int) -> Void) {
        audioTapQueue.async {
            self.audioFallbackCaptureActive = false
            guard let writer = self.audioFallbackWriter,
                  let input = self.audioFallbackInput,
                  let url = self.audioFallbackURL else {
                let sampleCount = self.audioFallbackSampleCount
                self.audioFallbackWriter = nil
                self.audioFallbackInput = nil
                self.audioFallbackURL = nil
                self.audioFallbackStarted = false
                self.audioFallbackSampleCount = 0
                completion(nil, sampleCount)
                return
            }

            let sampleCount = self.audioFallbackSampleCount
            self.audioFallbackWriter = nil
            self.audioFallbackInput = nil
            self.audioFallbackURL = nil
            self.audioFallbackStarted = false
            self.audioFallbackSampleCount = 0

            guard writer.status == .writing else {
                writer.cancelWriting()
                try? FileManager.default.removeItem(at: url)
                completion(nil, sampleCount)
                return
            }

            input.markAsFinished()
            writer.finishWriting {
                if writer.status == .completed, sampleCount > 0 {
                    completion(url, sampleCount)
                } else {
                    if let error = writer.error {
                        print("[NativeCameraTest] fallback audio writer failed: \(error.localizedDescription)")
                    }
                    try? FileManager.default.removeItem(at: url)
                    completion(nil, sampleCount)
                }
            }
        }
    }

    private func appendAudioFallbackSample(_ sampleBuffer: CMSampleBuffer) {
        guard audioFallbackCaptureActive, CMSampleBufferDataIsReady(sampleBuffer) else { return }
        if multitrackFirstAudioSampleHostTimeSec == nil {
            let presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            if presentationTime.isValid {
                let hostClock = CMClockGetHostTimeClock()
                let hostTime: CMTime
                if let masterClock = session.masterClock {
                    hostTime = CMSyncConvertTime(presentationTime, from: masterClock, to: hostClock)
                } else {
                    hostTime = presentationTime
                }
                let seconds = CMTimeGetSeconds(hostTime)
                if seconds.isFinite {
                    multitrackFirstAudioSampleHostTimeSec = seconds
                    print("[MultitrackCapture] firstAudioSampleHost=\(seconds)")
                }
            }
        }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription),
              let fallbackURL = audioFallbackURL else {
            return
        }

        let writer: AVAssetWriter
        let input: AVAssetWriterInput
        if let existingWriter = audioFallbackWriter, let existingInput = audioFallbackInput {
            writer = existingWriter
            input = existingInput
        } else {
            do {
                let asbd = asbdPointer.pointee
                let sampleRate = asbd.mSampleRate > 0 ? asbd.mSampleRate : 48_000
                let channelCount = max(1, Int(asbd.mChannelsPerFrame))
                let newWriter = try AVAssetWriter(outputURL: fallbackURL, fileType: .m4a)
                let outputSettings: [String: Any] = [
                    AVFormatIDKey: kAudioFormatMPEG4AAC,
                    AVSampleRateKey: sampleRate,
                    AVNumberOfChannelsKey: channelCount,
                    AVEncoderBitRateKey: 128_000,
                ]
                let newInput = AVAssetWriterInput(
                    mediaType: .audio,
                    outputSettings: outputSettings,
                    sourceFormatHint: formatDescription
                )
                newInput.expectsMediaDataInRealTime = true
                guard newWriter.canAdd(newInput) else {
                    print("[NativeCameraTest] fallback audio writer cannot add input")
                    audioFallbackCaptureActive = false
                    return
                }
                newWriter.add(newInput)
                audioFallbackWriter = newWriter
                audioFallbackInput = newInput
                writer = newWriter
                input = newInput
            } catch {
                print("[NativeCameraTest] fallback audio writer create failed: \(error.localizedDescription)")
                audioFallbackCaptureActive = false
                return
            }
        }

        if !audioFallbackStarted {
            let startTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
            guard writer.startWriting() else {
                print("[NativeCameraTest] fallback audio writer start failed: \(writer.error?.localizedDescription ?? "unknown")")
                audioFallbackCaptureActive = false
                return
            }
            writer.startSession(atSourceTime: startTime)
            audioFallbackStarted = true
            if isAudioOnlyRecording {
                print("[NativeAudioRecording] AVAssetWriter started")
                notifyAudioOnlyRecordingStartedIfNeeded()
            } else {
                print("[NativeCameraTest] fallback audio writer started")
            }
        }

        guard writer.status == .writing else { return }
        if input.isReadyForMoreMediaData {
            if input.append(sampleBuffer) {
                audioFallbackSampleCount += CMSampleBufferGetNumSamples(sampleBuffer)
            } else {
                print("[NativeCameraTest] fallback audio append failed: \(writer.error?.localizedDescription ?? "unknown")")
            }
        }
    }

    private func muxFallbackAudioIfNeeded(
        into videoURL: URL,
        fallbackAudioURL: URL?,
        audioTrimStartMs: Int,
        completion: @escaping (Result<Void, Error>) -> Void
    ) {
        guard let fallbackAudioURL = fallbackAudioURL else {
            completion(.success(()))
            return
        }

        let cleanup: () -> Void = {
            try? FileManager.default.removeItem(at: fallbackAudioURL)
        }

        let videoAsset = AVURLAsset(url: videoURL)
        if !videoAsset.tracks(withMediaType: .audio).isEmpty {
            cleanup()
            completion(.success(()))
            return
        }

        let audioAsset = AVURLAsset(url: fallbackAudioURL)
        guard let videoTrack = videoAsset.tracks(withMediaType: .video).first,
              let audioTrack = audioAsset.tracks(withMediaType: .audio).first else {
            cleanup()
            completion(.success(()))
            return
        }

        let videoDuration = videoAsset.duration
        guard CMTimeCompare(videoDuration, .zero) > 0 else {
            cleanup()
            completion(.success(()))
            return
        }

        let composition = AVMutableComposition()
        guard let compositionVideo = composition.addMutableTrack(
            withMediaType: .video,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ), let compositionAudio = composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            cleanup()
            completion(.success(()))
            return
        }

        do {
            try compositionVideo.insertTimeRange(
                CMTimeRange(start: .zero, duration: videoDuration),
                of: videoTrack,
                at: .zero
            )
            compositionVideo.preferredTransform = videoTrack.preferredTransform

            let requestedAudioStart = CMTime(value: Int64(audioTrimStartMs), timescale: 1000)
            let audioStart = CMTimeCompare(requestedAudioStart, audioAsset.duration) < 0 ? requestedAudioStart : .zero
            let availableAudioDuration = CMTimeSubtract(audioAsset.duration, audioStart)
            let audioDuration = CMTimeMinimum(videoDuration, availableAudioDuration)
            guard CMTimeCompare(audioDuration, .zero) > 0 else {
                cleanup()
                completion(.success(()))
                return
            }
            try compositionAudio.insertTimeRange(
                CMTimeRange(start: audioStart, duration: audioDuration),
                of: audioTrack,
                at: .zero
            )
        } catch {
            cleanup()
            completion(.failure(error))
            return
        }

        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
            cleanup()
            completion(.success(()))
            return
        }

        let muxedURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("muxed-\(UUID().uuidString).mp4")
        try? FileManager.default.removeItem(at: muxedURL)
        exportSession.outputURL = muxedURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true

        print("[NativeCameraTest] muxing fallback audio into silent movie file")
        exportSession.exportAsynchronously {
            cleanup()
            if exportSession.status == .completed {
                do {
                    try FileManager.default.removeItem(at: videoURL)
                    try FileManager.default.moveItem(at: muxedURL, to: videoURL)
                    print("[NativeCameraTest] fallback audio mux complete")
                    completion(.success(()))
                } catch {
                    completion(.failure(error))
                }
            } else if let error = exportSession.error {
                try? FileManager.default.removeItem(at: muxedURL)
                completion(.failure(error))
            } else {
                try? FileManager.default.removeItem(at: muxedURL)
                completion(.failure(NSError(
                    domain: "NativeCameraTest",
                    code: 22,
                    userInfo: [NSLocalizedDescriptionKey: "Fallback audio mux failed without error"]
                )))
            }
        }
    }

    private func trimVideo(sourceURL: URL, trimStartMs: Int, completion: @escaping (Result<URL, Error>) -> Void) {
        let asset = AVURLAsset(url: sourceURL)
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
            completion(.failure(NSError(
                domain: "NativeCameraTest",
                code: 20,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create AVAssetExportSession for passthrough trim"]
            )))
            return
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("trimmed-\(UUID().uuidString).mp4")
        try? FileManager.default.removeItem(at: outputURL)

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true

        let startTime = CMTime(value: Int64(trimStartMs), timescale: 1000)
        let duration = CMTimeSubtract(asset.duration, startTime)
        exportSession.timeRange = CMTimeRange(start: startTime, duration: duration)

        print("[NativeCameraTest] Trimming video: starting at \(trimStartMs)ms, new duration: \(CMTimeGetSeconds(duration))s")
        exportSession.exportAsynchronously {
            if exportSession.status == .completed {
                completion(.success(outputURL))
            } else if let error = exportSession.error {
                completion(.failure(error))
            } else {
                completion(.failure(NSError(
                    domain: "NativeCameraTest",
                    code: 21,
                    userInfo: [NSLocalizedDescriptionKey: "AVAssetExportSession failed without error"]
                )))
            }
        }
    }

    private func finalizeStopResult(for fileURL: URL, completion: ((Result<[String: Any], Error>) -> Void)?) {
        defer { stopProcessingStartedAt = 0 }
        do {
            let info = try self.buildStopResult(for: fileURL)
            self.logStopStage("stop-result-ready")
            print("[NativeCameraTest] recording stopped")
            print("[NativeCameraTest] file saved")
            for (key, value) in info.sorted(by: { $0.key < $1.key }) {
                print("[NativeCameraTest] \(key) = \(value)")
            }
            self.restoreAudioSessionAfterTest()
            DispatchQueue.main.async {
                completion?(.success(info))
            }
        } catch {
            self.restoreAudioSessionAfterTest()
            DispatchQueue.main.async {
                completion?(.failure(error))
            }
        }
    }

    private func buildStopResult(for fileURL: URL, audioOnly: Bool = false) throws -> [String: Any] {
        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (attributes[.size] as? NSNumber)?.intValue ?? 0

        let asset = AVURLAsset(url: fileURL)
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        let safeDuration = durationSeconds.isFinite && durationSeconds > 0 ? durationSeconds : 0

        var width = audioOnly ? 0 : recordedVideoWidth
        var height = audioOnly ? 0 : recordedVideoHeight
        if !audioOnly, let videoTrack = asset.tracks(withMediaType: .video).first {
            let size = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
            width = Int(abs(size.width))
            height = Int(abs(size.height))
        }

        let routeSnapshot = AudioRouteConfigurator.routeSnapshot()
        let route = routeSnapshot["outputPort"] as? String ?? "unknown"
        let relativePath = "takes/\(fileURL.lastPathComponent)"

        let audioTracks = asset.tracks(withMediaType: .audio)
        let audioTrackCount = audioTracks.count
        let logPrefix = audioOnly ? "NativeAudioRecording" : "NativeCameraTest"
        if audioTrackCount == 0 {
            print("[\(logPrefix)] WARNING: finished recording has NO audio track in file — silence is in-file, not playback-only")
        } else {
            print("[\(logPrefix)] finished recording audioTrackCount=\(audioTrackCount)")
        }

        var result: [String: Any] = [
            "filePath": relativePath,
            "fileURL": fileURL.absoluteString,
            "duration": safeDuration,
            "fileSize": fileSize,
            "mimeType": audioOnly ? "audio/mp4" : "video/mp4",
            "width": width,
            "height": height,
            "route": route,
            "audioSessionProfile": activeAudioProfile.rawValue,
            "audioTrackCount": audioTrackCount,
            "hasAudioTrack": audioTrackCount > 0,
        ]

        if let takeId = audioOnlyTakeId {
            result["takeId"] = takeId
        }

        if !audioOnly, let movieOutput = movieOutput {
            logMovieAudioConnection(context: "recordStop", movieOutput: movieOutput)
        }

        logStopStage("levels-start")
        if let levels = NativeCameraTestAudio.measureLevels(fileURL: fileURL) {
            NativeCameraTestAudio.logFileLevels(levels)
            for (key, value) in NativeCameraTestAudio.levelsPayload(levels) {
                result[key] = value
            }
        } else if audioTrackCount == 0 {
            print("[NativeCameraTest] measureLevels skipped — no audio track to analyze")
        } else {
            print("[NativeCameraTest] measureLevels failed — audio track present but unreadable")
        }

        logStopStage("levels-finished")
        let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: activeAudioProfile)
        for (key, value) in sessionInfo {
            result[key] = value
        }

        let multitrackTiming = audioTapQueue.sync { () -> (Double?, Double?, Double?) in
            (
                self.multitrackFirstAudioSampleHostTimeSec,
                self.multitrackPerformanceAnchorHostTimeSec,
                self.multitrackPerformanceFileTimeSec
            )
        }
        let audioTrackStartSec = audioTracks.first.map { track in
            let seconds = CMTimeGetSeconds(track.timeRange.start)
            return seconds.isFinite ? max(0, seconds) : 0
        } ?? 0
        let sourceInMs: Int?
        if let firstSampleHost = multitrackTiming.0,
           let performanceHost = multitrackTiming.1 {
            // This is the exact mapping from the shared native transport's
            // downbeat onto the captured audio samples. recordedDuration is a
            // live pipeline estimate and can lag by one or more buffers, which
            // made the previous take begin slightly late on every overdub.
            let performanceFileTime = audioTrackStartSec + max(
                0,
                performanceHost - firstSampleHost
            )
            sourceInMs = max(0, Int((performanceFileTime * 1000).rounded()))
            result["multitrackPerformanceFileTimeSec"] = performanceFileTime
            result["multitrackAudioTrackStartSec"] = audioTrackStartSec
            result["multitrackTimingMethod"] = "audioSampleHostClock"
        } else if let performanceFileTime = multitrackTiming.2 {
            sourceInMs = max(0, Int((performanceFileTime * 1000).rounded()))
            result["multitrackPerformanceFileTimeSec"] = performanceFileTime
            result["multitrackTimingMethod"] = "recordedDurationFallback"
        } else {
            sourceInMs = nil
        }
        if let sourceInMs {
            result["multitrackSourceInMs"] = sourceInMs
            print("[MultitrackCapture] measuredSourceInMs=\(sourceInMs)")
        }
        if let firstSampleHost = multitrackTiming.0 {
            result["multitrackFirstAudioSampleHostTimeSec"] = firstSampleHost
        }
        if let performanceHost = multitrackTiming.1 {
            result["multitrackPerformanceAnchorHostTimeSec"] = performanceHost
        }

        return result
    }

    // MARK: - Audio-only recording (Audio Mode — AVAssetWriter via audio data output)

    func startTunerMonitor(
        micInputPreference: AudioRouteConfigurator.MicInputPreference = .auto,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        requestMediaAccess(mediaType: .audio) { [weak self] audioGranted in
            guard let self = self else { return }
            guard audioGranted else {
                completion(.failure(NSError(
                    domain: "NativeTunerMonitor",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied"]
                )))
                return
            }

            self.sessionQueue.async {
                do {
                    guard !self.isRecording && !self.isStarting && !self.isAudioOnlyRecording else {
                        throw NSError(
                            domain: "NativeTunerMonitor",
                            code: 3,
                            userInfo: [NSLocalizedDescriptionKey: "Recording owns microphone"]
                        )
                    }
                    try self.configureAudioSessionForRecording(
                        profile: .playAndRecordDefault,
                        micInputPreference: micInputPreference
                    )
                    let tapIsFresh =
                        self.lastAudioTapSampleTime > 0 &&
                        CACurrentMediaTime() - self.lastAudioTapSampleTime < 2.5
                    if self.isTunerMonitorActive &&
                        self.session.isRunning &&
                        self.isSessionConfigured &&
                        tapIsFresh {
                        DispatchQueue.main.async {
                            completion(.success(["active": true]))
                        }
                        return
                    }
                    _ = try self.configureAudioOnlyCaptureSession()
                    self.lastAudioTapSampleTime = 0
                    self.isTunerMonitorActive = true
                    self.needsFullReconfigureAfterMediaReset = false
                    // An explicit start is fresh intent, not a retry — let the
                    // next failure recover immediately rather than inheriting
                    // the previous session's backoff.
                    self.consecutiveRecoveryAttempts = 0
                    self.lastRecoveryAttemptAt = 0
                    if !self.session.isRunning {
                        self.session.startRunning()
                    }
                    DispatchQueue.main.async {
                        completion(.success(["active": true]))
                    }
                } catch {
                    self.isTunerMonitorActive = false
                    DispatchQueue.main.async {
                        completion(.failure(error))
                    }
                }
            }
        }
    }

    func stopTunerMonitor(completion: @escaping (_ captureStillActive: Bool) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            self.isTunerMonitorActive = false
            if !self.isRecording &&
                !self.isStarting &&
                !self.isAudioOnlyRecording &&
                !self.isPreviewActive &&
                !self.isBridgePreviewActive {
                if self.session.isRunning {
                    self.session.stopRunning()
                }
                self.isSessionConfigured = false
                self.audioDataOutput = nil
                self.restoreAudioSessionAfterTest()
            }
            let captureStillActive =
                self.isRecording ||
                self.isStarting ||
                self.isAudioOnlyRecording ||
                self.isPreviewActive ||
                self.isBridgePreviewActive
            DispatchQueue.main.async {
                completion(captureStillActive)
            }
        }
    }

    func startAudioRecording(
        takeId: String,
        audioSessionProfile: NativeCameraAudioSessionProfile = .playAndRecordDefault,
        micInputPreference: AudioRouteConfigurator.MicInputPreference = .auto,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        requestMediaAccess(mediaType: .audio) { [weak self] audioGranted in
            guard let self = self else { return }
            guard audioGranted else {
                completion(.failure(NSError(
                    domain: "NativeAudioRecording",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied"]
                )))
                return
            }
            self.sessionQueue.async {
                do {
                    let result = try self.startAudioOnSessionQueue(
                        takeId: takeId,
                        audioSessionProfile: audioSessionProfile,
                        micInputPreference: micInputPreference,
                        completion: completion
                    )
                    print("[NativeAudioRecording] start requested")
                    print("[NativeAudioRecording] fileURL = \(result["fileURL"] ?? "unknown")")
                } catch {
                    DispatchQueue.main.async {
                        completion(.failure(error))
                    }
                }
            }
        }
    }

    func stopAudioRecording(trimStartMs: Int = 0, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            self.pendingTrimStartMs = trimStartMs

            guard self.isAudioOnlyRecording,
                  self.isRecording || self.isStarting || self.audioFallbackCaptureActive else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(
                        domain: "NativeAudioRecording",
                        code: 10,
                        userInfo: [NSLocalizedDescriptionKey: "Not recording"]
                    )))
                }
                return
            }

            // If stop arrives before didStart-equivalent fires, fail the pending start
            // so JS is not left awaiting a promise that will never resolve.
            if !self.isRecording, let pendingStart = self.startCompletion {
                self.startCompletion = nil
                self.pendingStartResult = nil
                DispatchQueue.main.async {
                    pendingStart(.failure(NSError(
                        domain: "NativeAudioRecording",
                        code: 14,
                        userInfo: [NSLocalizedDescriptionKey: "Recording stopped before start completed"]
                    )))
                }
            }

            self.stopCompletion = completion
            self.isStarting = false

            self.audioTapQueue.async {
                self.audioFallbackCaptureActive = false
                self.finishAudioFallbackCapture { audioURL, sampleCount in
                    self.sessionQueue.async {
                        self.isRecording = false
                        self.stopRecordingDiagnosticsTimer()

                        let completion = self.stopCompletion
                        self.stopCompletion = nil
                        let trimStartMs = self.pendingTrimStartMs
                        self.pendingTrimStartMs = 0
                        self.isAudioOnlyRecording = false

                        guard let fileURL = audioURL, sampleCount > 0 else {
                            self.audioOnlyTakeId = nil
                            self.restoreAudioSessionAfterTest()
                            if self.session.isRunning && !self.isPreviewActive && !self.isBridgePreviewActive {
                                self.session.stopRunning()
                            }
                            self.isSessionConfigured = false
                            self.audioDataOutput = nil
                            DispatchQueue.main.async {
                                completion?(.failure(NSError(
                                    domain: "NativeAudioRecording",
                                    code: 13,
                                    userInfo: [NSLocalizedDescriptionKey: "No audio captured"]
                                )))
                            }
                            return
                        }

                        if trimStartMs > 0 {
                            self.trimAudioOnly(sourceURL: fileURL, trimStartMs: trimStartMs) { trimResult in
                                self.sessionQueue.async {
                                    switch trimResult {
                                    case .success(let url):
                                        self.finalizeAudioOnlyStopResult(for: url, completion: completion)
                                    case .failure(let error):
                                        self.restoreAudioSessionAfterTest()
                                        DispatchQueue.main.async {
                                            completion?(.failure(error))
                                        }
                                    }
                                }
                            }
                        } else {
                            self.finalizeAudioOnlyStopResult(for: fileURL, completion: completion)
                        }
                    }
                }
            }
        }
    }

    private func startAudioOnSessionQueue(
        takeId: String,
        audioSessionProfile: NativeCameraAudioSessionProfile,
        micInputPreference: AudioRouteConfigurator.MicInputPreference,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) throws -> [String: Any] {
        if isRecording || isStarting || isAudioOnlyRecording {
            throw NSError(
                domain: "NativeAudioRecording",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Already recording"]
            )
        }

        isTunerMonitorActive = false
        isAudioOnlyRecording = true
        audioOnlyTakeId = takeId
        isStarting = true

        do {
            try configureAudioSessionForRecording(
                profile: audioSessionProfile,
                micInputPreference: micInputPreference
            )

            _ = try configureAudioOnlyCaptureSession()

            let takesDir = try takesDirectoryURL()
            let filename = "\(takeId).m4a"
            let fileURL = takesDir.appendingPathComponent(filename)
            outputURL = fileURL
            beginAudioOnlyRecording(for: fileURL)

            if !session.isRunning {
                session.startRunning()
            }

            let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: audioSessionProfile)
            let route = sessionInfo["outputRoute"] as? String ?? "unknown"
            let inputRoute = sessionInfo["inputRoute"] as? String ?? "unknown"

            var result: [String: Any] = [
                "filePath": "takes/\(filename)",
                "fileURL": fileURL.absoluteString,
                "route": route,
                "inputRoute": inputRoute,
                "audioSessionProfile": audioSessionProfile.rawValue,
                "takeId": takeId,
            ]
            for (key, value) in sessionInfo {
                result[key] = value
            }

            startCompletion = completion
            pendingStartResult = result
            AudioRouteConfigurator.logMicRouteProof(
                context: "audioOnlyRecordingStartRequested",
                preference: activeMicInputPreference
            )
            print("[NativeAudioRecording] session started — awaiting first audio sample")
            return result
        } catch {
            isAudioOnlyRecording = false
            isStarting = false
            audioOnlyTakeId = nil
            startCompletion = nil
            pendingStartResult = nil
            throw error
        }
    }

    private func configureAudioOnlyCaptureSession() throws {
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        for input in session.inputs { session.removeInput(input) }
        for output in session.outputs { session.removeOutput(output) }

        movieOutput = nil
        videoDataOutput = nil
        audioDataOutput = nil
        isSessionConfigured = false

        if session.canSetSessionPreset(.high) {
            session.sessionPreset = .high
        }

        guard let audioDevice = preferredAudioCaptureDevice() else {
            throw NSError(
                domain: "NativeAudioRecording",
                code: 6,
                userInfo: [NSLocalizedDescriptionKey: "Built-in microphone unavailable"]
            )
        }

        let audioInput = try AVCaptureDeviceInput(device: audioDevice)
        guard session.canAddInput(audioInput) else {
            throw NSError(
                domain: "NativeAudioRecording",
                code: 7,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add audio input"]
            )
        }
        session.addInput(audioInput)

        let audioTapOutput = AVCaptureAudioDataOutput()
        audioTapOutput.setSampleBufferDelegate(self, queue: audioTapQueue)
        guard session.canAddOutput(audioTapOutput) else {
            throw NSError(
                domain: "NativeAudioRecording",
                code: 8,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add audio data output"]
            )
        }
        session.addOutput(audioTapOutput)
        audioDataOutput = audioTapOutput
        isSessionConfigured = true
        print("[NativeAudioRecording] audio-only capture session configured")
    }

    private func beginAudioOnlyRecording(for fileURL: URL) {
        // Arm the writer synchronously before startRunning() can deliver samples.
        audioTapQueue.sync {
            self.audioFallbackWriter?.cancelWriting()
            if let oldURL = self.audioFallbackURL, oldURL != fileURL {
                try? FileManager.default.removeItem(at: oldURL)
            }
            try? FileManager.default.removeItem(at: fileURL)
            self.audioFallbackWriter = nil
            self.audioFallbackInput = nil
            self.audioFallbackURL = fileURL
            self.audioFallbackCaptureActive = true
            self.audioFallbackStarted = false
            self.audioFallbackSampleCount = 0
            print("[NativeAudioRecording] AVAssetWriter armed for \(fileURL.lastPathComponent)")
        }
    }

    private func notifyAudioOnlyRecordingStartedIfNeeded() {
        guard isAudioOnlyRecording, !isRecording else { return }
        sessionQueue.async { [weak self] in
            guard let self = self, self.isAudioOnlyRecording, !self.isRecording else { return }
            self.isRecording = true
            self.isStarting = false
            self.startRecordingDiagnosticsTimer()

            let completion = self.startCompletion
            let result = self.pendingStartResult
            self.startCompletion = nil
            self.pendingStartResult = nil

            print("[NativeAudioRecording] recording started (first audio sample written)")
            AudioRouteConfigurator.logMicRouteProof(
                context: "audioOnlyRecordingStarted",
                preference: self.activeMicInputPreference
            )
            DispatchQueue.main.async {
                if let result = result {
                    completion?(.success(result))
                }
            }
        }
    }

    private func finalizeAudioOnlyStopResult(
        for fileURL: URL,
        completion: ((Result<[String: Any], Error>) -> Void)?
    ) {
        do {
            let info = try buildStopResult(for: fileURL, audioOnly: true)
            print("[NativeAudioRecording] recording stopped")
            restoreAudioSessionAfterTest()
            if session.isRunning && !isPreviewActive && !isBridgePreviewActive {
                session.stopRunning()
            }
            isSessionConfigured = false
            audioDataOutput = nil
            audioOnlyTakeId = nil
            DispatchQueue.main.async {
                completion?(.success(info))
            }
        } catch {
            restoreAudioSessionAfterTest()
            audioOnlyTakeId = nil
            DispatchQueue.main.async {
                completion?(.failure(error))
            }
        }
    }

    private func trimAudioOnly(
        sourceURL: URL,
        trimStartMs: Int,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        let asset = AVURLAsset(url: sourceURL)
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            completion(.failure(NSError(
                domain: "NativeAudioRecording",
                code: 20,
                userInfo: [NSLocalizedDescriptionKey: "Cannot create audio export session"]
            )))
            return
        }

        let startTime = CMTime(value: Int64(trimStartMs), timescale: 1000)
        let duration = asset.duration
        let trimmedDuration = CMTimeSubtract(duration, startTime)
        guard CMTimeGetSeconds(trimmedDuration) > 0.05 else {
            completion(.success(sourceURL))
            return
        }

        let tempURL = sourceURL.deletingLastPathComponent()
            .appendingPathComponent("trim-\(UUID().uuidString).m4a")
        exportSession.outputURL = tempURL
        exportSession.outputFileType = .m4a
        exportSession.timeRange = CMTimeRange(start: startTime, duration: trimmedDuration)

        exportSession.exportAsynchronously {
            switch exportSession.status {
            case .completed:
                do {
                    _ = try FileManager.default.replaceItemAt(sourceURL, withItemAt: tempURL)
                    completion(.success(sourceURL))
                } catch {
                    try? FileManager.default.removeItem(at: tempURL)
                    completion(.failure(error))
                }
            case .failed, .cancelled:
                try? FileManager.default.removeItem(at: tempURL)
                completion(.failure(exportSession.error ?? NSError(
                    domain: "NativeAudioRecording",
                    code: 21,
                    userInfo: [NSLocalizedDescriptionKey: "Audio trim export failed"]
                )))
            default:
                try? FileManager.default.removeItem(at: tempURL)
                completion(.failure(NSError(
                    domain: "NativeAudioRecording",
                    code: 22,
                    userInfo: [NSLocalizedDescriptionKey: "Audio trim export incomplete"]
                )))
            }
        }
    }
}

extension NativeCameraRecordingEngine {
    private func copySampleBuffer(_ sampleBuffer: CMSampleBuffer) -> CMSampleBuffer? {
        var copied: CMSampleBuffer?
        let status = CMSampleBufferCreateCopy(allocator: kCFAllocatorDefault, sampleBuffer: sampleBuffer, sampleBufferOut: &copied)
        guard status == noErr else { return nil }
        return copied
    }

    private func isRecordingPlayAlongBridgeActive() -> Bool {
        CameraSessionGuard.youtubePlayAlongActive && CameraSessionGuard.recordingActive
    }

    private func effectiveBridgeFrameInterval() -> CFTimeInterval {
        // Plain recording keeps the full-rate preview. YouTube play-along uses
        // a moderate frame cap plus smaller JPEGs so expand-mode preview stays
        // smooth without pushing full-size frames through WKWebView.
        if isRecordingPlayAlongBridgeActive() {
            return 1.0 / bridgeFramesPerSecondRecordingPlayAlong
        }
        return 1.0 / bridgeFramesPerSecondFull
    }

    private func drainBridgeFrames() {
        guard
            isFrameBridgeActive,
            !isBridgeEncoding,
            bridgeFrameAwaitingAck == nil,
            let sample = pendingBridgeSample
        else { return }

        let now = CACurrentMediaTime()
        guard now - lastBridgeFrameTime >= effectiveBridgeFrameInterval() else { return }

        lastBridgeFrameTime = now
        pendingBridgeSample = nil
        isBridgeEncoding = true
        let generation = bridgeGeneration

        frameEncodeQueue.async { [weak self] in
            guard let self = self else { return }
            let payload = self.jpegPayload(from: sample, mirrored: false)

            self.frameBridgeQueue.async {
                guard self.bridgeGeneration == generation else { return }
                self.isBridgeEncoding = false
                guard self.isFrameBridgeActive, let payload = payload else {
                    self.drainBridgeFrames()
                    return
                }

                self.nextBridgeFrameId &+= 1
                let frameId = self.nextBridgeFrameId
                self.bridgeFrameAwaitingAck = frameId
                let handler = self.onPreviewFrame

                DispatchQueue.main.async {
                    handler?(payload.0, payload.1, payload.2, frameId)
                }

                self.frameBridgeQueue.asyncAfter(deadline: .now() + self.bridgeFrameAckTimeout) {
                    guard
                        self.bridgeGeneration == generation,
                        self.bridgeFrameAwaitingAck == frameId
                    else { return }
                    self.consecutiveBridgeAckTimeouts += 1
                    // Always release the in-flight slot. Holding it until a late
                    // acknowledgement arrived assumed some consumer would
                    // eventually ack *this* frame — but a frame delivered while
                    // no JS listener is attached (expand view showing a pinned
                    // take, preview held for take playback, a listener swapped
                    // between the fullscreen and embedded canvas) is never acked
                    // by anyone, so the preview froze until the whole bridge was
                    // torn down and rebuilt. Past the budget we keep delivering
                    // at a reduced rate instead of stopping: a genuinely stalled
                    // WebKit costs one JPEG every bridgeStalledRetryInterval, and
                    // a consumer that comes back repaints within that window.
                    self.bridgeFrameAwaitingAck = nil
                    guard self.consecutiveBridgeAckTimeouts < self.bridgeMaxAckTimeouts else {
                        self.frameBridgeQueue.asyncAfter(deadline: .now() + self.bridgeStalledRetryInterval) {
                            guard self.bridgeGeneration == generation else { return }
                            self.drainBridgeFrames()
                        }
                        return
                    }
                    self.drainBridgeFrames()
                }
            }
        }
    }

    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        // Shared delegate method: audio tap samples arrive on audioTapQueue,
        // video pump frames on frameBridgeQueue.
        if output === audioDataOutput {
            handleAudioTapSample(sampleBuffer)
            return
        }

        guard isFrameBridgeActive else { return }
        guard let copiedBuffer = copySampleBuffer(sampleBuffer) else { return }

        pendingBridgeSample = copiedBuffer
        drainBridgeFrames()
    }

    /// Toggle PCM chunk delivery to JS. The output itself stays attached to the
    /// session permanently; only emission is gated (queue-confined state).
    func setAudioTapEnabled(_ enabled: Bool) {
        print("[PitchTap] setAudioTapEnabled(\(enabled)) — audioDataOutput attached: \(self.audioDataOutput != nil), session running: \(self.session.isRunning)")
        audioTapQueue.async {
            self.isAudioTapEnabled = enabled
            self.didLogFirstTapSample = false
            if !enabled {
                self.tapAccumulator.removeAll()
                // Already queued encoders still decrement this count when
                // they finish. Resetting it here made it negative on rapid
                // tool switches, defeating the queue's memory bound.
            }
        }
    }

    /// Runs on audioTapQueue (the tap output's delegate queue).
    private func handleAudioTapSample(_ sampleBuffer: CMSampleBuffer) {
        appendAudioFallbackSample(sampleBuffer)
        lastAudioTapSampleTime = CACurrentMediaTime()
        guard isAudioTapEnabled || isAudioOnlyRecording || tunerPitchEnabled else { return }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            return
        }
        let asbd = asbdPointer.pointee
        if !didLogFirstTapSample {
            didLogFirstTapSample = true
            didLogTapExtractionFailure = false
            print(
                "[PitchTap] FIRST audio sample received from capture session — tap is delivering " +
                "(\(Self.describeTapFormat(asbd)))"
            )
        }
        guard let mono = channelZeroSamples(from: sampleBuffer, format: asbd) else { return }

        if tunerPitchEnabled {
            if tunerPitchSampleRate != asbd.mSampleRate {
                tunerPitchSamples.removeAll(keepingCapacity: true)
                tunerPitchSampleRate = asbd.mSampleRate
                tunerPitchGeneration += 1
            }
            tunerPitchSamples.append(contentsOf: mono)
            let windowSize = 4096
            if tunerPitchSamples.count >= windowSize {
                let window = Array(tunerPitchSamples.suffix(windowSize))
                tunerPitchSamples.removeFirst(tunerPitchSamples.count - 2048)
                tunerPitchWorkLock.lock()
                let busy = tunerPitchWorkPending
                if !busy { tunerPitchWorkPending = true }
                tunerPitchWorkLock.unlock()
                if !busy {
                    let generation = tunerPitchGeneration
                    let rate = asbd.mSampleRate
                    tunerPitchWorkQueue.async { [weak self] in
                        guard let self = self else { return }
                        let result = estimateNativeTunerPitch(window, sampleRate: rate)
                        self.audioTapQueue.async {
                            if self.tunerPitchEnabled && self.tunerPitchGeneration == generation {
                                self.onTunerPitch?(result.frequency, result.confidence, result.rmsDb)
                            }
                            self.tunerPitchWorkLock.lock()
                            self.tunerPitchWorkPending = false
                            self.tunerPitchWorkLock.unlock()
                        }
                    }
                }
            }
        }
        guard isAudioTapEnabled || isAudioOnlyRecording else { return }
        tapAccumulator.append(contentsOf: mono)
        let chunkSize = 2048
        let sampleRate = asbd.mSampleRate
        while tapAccumulator.count >= chunkSize {
            let chunk = Array(tapAccumulator.prefix(chunkSize))
            tapAccumulator.removeFirst(chunkSize)
            audioTapBacklogLock.lock()
            let saturated = audioTapBacklog >= Self.audioTapMaxBacklog
            if !saturated { audioTapBacklog += 1 }
            audioTapBacklogLock.unlock()
            // Encoder is behind — drop this frame rather than queue it forever.
            if saturated { continue }

            // Encode + bridge notify happen off audioTapQueue — see comment on
            // audioTapEncodeQueue's declaration.
            audioTapEncodeQueue.async { [weak self] in
                guard let self = self else { return }
                let payload = chunk.withUnsafeBufferPointer { Data(buffer: $0) }
                self.onAudioTapChunk?(payload.base64EncodedString(), sampleRate, chunkSize)
                self.audioTapBacklogLock.lock()
                self.audioTapBacklog -= 1
                self.audioTapBacklogLock.unlock()
            }
        }
    }

    /**
     * Channel 0 of a capture buffer, as Float samples.
     *
     * The capture format is whatever the microphones deliver, and it is not
     * always one channel in one buffer. An iPad's mic array can hand over two
     * channels non-interleaved — one AudioBuffer each — and a list sized for a
     * single buffer then fails with kCMSampleBufferError_ArrayTooSmall on every
     * sample buffer. The capture session itself stays healthy and keeps
     * refreshing `lastAudioTapSampleTime`, so nothing noticed: the tuner and
     * hands-free simply never heard a note. Size the list from what the sample
     * buffer says it needs.
     */
    private func channelZeroSamples(
        from sampleBuffer: CMSampleBuffer,
        format asbd: AudioStreamBasicDescription
    ) -> [Float]? {
        let flags = kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment
        var neededSize = 0
        var status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: &neededSize,
            bufferListOut: nil,
            bufferListSize: 0,
            blockBufferAllocator: nil,
            blockBufferMemoryAllocator: nil,
            flags: flags,
            blockBufferOut: nil
        )
        guard status == noErr, neededSize >= MemoryLayout<AudioBufferList>.size else {
            logTapExtractionFailure(status: status, format: asbd)
            return nil
        }

        let rawList = UnsafeMutableRawPointer.allocate(
            byteCount: neededSize,
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { rawList.deallocate() }
        let listPointer = rawList.bindMemory(to: AudioBufferList.self, capacity: 1)

        var blockBuffer: CMBlockBuffer?
        status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: listPointer,
            bufferListSize: neededSize,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: flags,
            blockBufferOut: &blockBuffer
        )
        guard status == noErr else {
            logTapExtractionFailure(status: status, format: asbd)
            return nil
        }

        // The block buffer owns the memory the list points into.
        return withExtendedLifetime(blockBuffer) { () -> [Float]? in
            let buffers = UnsafeMutableAudioBufferListPointer(listPointer)
            guard let firstBuffer = buffers.first, let rawData = firstBuffer.mData else { return nil }

            let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
            let isSignedInt = (asbd.mFormatFlags & kAudioFormatFlagIsSignedInteger) != 0
            // Non-interleaved: the first buffer is channel 0 alone. Interleaved:
            // every channel is in it, frame by frame.
            let isNonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
            let interleavedChannels = Int(firstBuffer.mNumberChannels > 0
                ? firstBuffer.mNumberChannels
                : asbd.mChannelsPerFrame)
            let stride = isNonInterleaved ? 1 : max(1, interleavedChannels)

            func read<Sample>(_: Sample.Type, _ normalize: (Sample) -> Float) -> [Float] {
                let sampleCount = Int(firstBuffer.mDataByteSize) / MemoryLayout<Sample>.size
                let samples = rawData.bindMemory(to: Sample.self, capacity: sampleCount)
                let frames = sampleCount / stride
                var mono = [Float](repeating: 0, count: frames)
                for frame in 0..<frames {
                    mono[frame] = normalize(samples[frame * stride])
                }
                return mono
            }

            if isFloat && asbd.mBitsPerChannel == 32 {
                return read(Float.self) { $0 }
            }
            if isSignedInt && asbd.mBitsPerChannel == 16 {
                return read(Int16.self) { Float($0) / 32768.0 }
            }
            if isSignedInt && asbd.mBitsPerChannel == 32 {
                return read(Int32.self) { Float($0) / Float(Int32.max) }
            }
            logTapExtractionFailure(status: noErr, format: asbd)
            return nil
        }
    }

    /// Once per tap enable: a format this cannot read, or a buffer it cannot
    /// extract, must say so rather than leave the tuner quietly deaf.
    private func logTapExtractionFailure(status: OSStatus, format asbd: AudioStreamBasicDescription) {
        guard !didLogTapExtractionFailure else { return }
        didLogTapExtractionFailure = true
        print(
            "[PitchTap] cannot read capture audio status=\(status) " +
            "(\(Self.describeTapFormat(asbd))) — tuner and hands-free will hear nothing"
        )
    }

    private static func describeTapFormat(_ asbd: AudioStreamBasicDescription) -> String {
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        let isNonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
        return "rate=\(asbd.mSampleRate) channels=\(asbd.mChannelsPerFrame) " +
            "bits=\(asbd.mBitsPerChannel) \(isFloat ? "float" : "int") " +
            "\(isNonInterleaved ? "non-interleaved" : "interleaved") flags=\(asbd.mFormatFlags)"
    }
}

// BEGIN NATIVE TUNER DETECTOR
/// McLeod normalized square difference; bounded window, Accelerate dot products.
/// The UI retains its existing instrument-specific smoothing and note hysteresis.
struct NativeTunerEstimate {
    let frequency: Double
    let confidence: Double
    let rmsDb: Double
}
func estimateNativeTunerPitch(_ input: [Float], sampleRate: Double) -> NativeTunerEstimate {
    guard input.count >= 1024, sampleRate > 0 else { return NativeTunerEstimate(frequency: 0, confidence: 0, rmsDb: -160) }
    var samples = input
    var mean: Float = 0
    vDSP_meanv(samples, 1, &mean, vDSP_Length(samples.count))
    var negativeMean = -mean
    vDSP_vsadd(samples, 1, &negativeMean, &samples, 1, vDSP_Length(samples.count))
    var power: Float = 0
    vDSP_measqv(samples, 1, &power, vDSP_Length(samples.count))
    let rmsDb = 10 * log10(max(Double(power), 1e-16))
    guard rmsDb.isFinite, rmsDb > -65 else { return NativeTunerEstimate(frequency: 0, confidence: 0, rmsDb: rmsDb.isFinite ? rmsDb : -160) }
    let n = samples.count, maxLag = min(n / 2, Int(sampleRate / 38))
    var energy = [Double](repeating: 0, count: n+1)
    for i in 0..<n { energy[i+1] = energy[i]+Double(samples[i])*Double(samples[i]) }
    var nsdf = [Double](repeating: 0, count: maxLag+1)
    samples.withUnsafeBufferPointer { p in
        guard let base = p.baseAddress else { return }
        for lag in 0...maxLag {
            var correlation: Float = 0
            vDSP_dotpr(base, 1, base+lag, 1, &correlation, vDSP_Length(n-lag))
            let denominator = energy[n-lag]+energy[n]-energy[lag]
            nsdf[lag] = denominator > 1e-12 ? 2*Double(correlation)/denominator : 0
        }
    }
    // Skip the zero-lag lobe, then retain the strongest peak in each positive lobe.
    var peaks: [Int] = [], passedZero = false, candidate: Int? = nil
    for lag in 1..<maxLag {
        if nsdf[lag] <= 0 {
            passedZero = true
            if let peak = candidate { peaks.append(peak); candidate = nil }
        } else if passedZero && (candidate == nil || nsdf[lag] > nsdf[candidate!]) { candidate = lag }
    }
    if let peak = candidate, peak < maxLag-1 { peaks.append(peak) }
    let strongest = peaks.map { nsdf[$0] }.max() ?? 0
    guard strongest >= 0.5, let peak = peaks.first(where: { nsdf[$0] >= max(0.5,strongest*0.93) }) else {
        return NativeTunerEstimate(frequency: 0, confidence: max(0,strongest), rmsDb: rmsDb)
    }
    let a = nsdf[peak-1], b = nsdf[peak], c = nsdf[peak+1]
    let denominator = a-2*b+c
    let offset = abs(denominator) > 1e-12 ? 0.5*(a-c)/denominator : 0
    return NativeTunerEstimate(frequency: sampleRate/(Double(peak)+offset), confidence: min(1,max(0,b)), rmsDb: rmsDb)
}
// END NATIVE TUNER DETECTOR
