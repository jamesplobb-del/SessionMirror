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
    private var isAudioTapEnabled = false
    private var tapAccumulator: [Float] = []
    private var didLogFirstTapSample = false
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
    private let bridgeFramesPerSecond: Double = 60
    // Preview-only pump sizing. The recorded movie file uses a separate
    // full-resolution AVCaptureMovieFileOutput and is UNAFFECTED by these.
    // 1080px/0.75 JPEG base64 at 60fps saturates the Capacitor/WKWebView bridge
    // and stutters; 720px/0.6 is ample for an on-screen phone preview and cuts
    // per-frame payload ~2.5x, letting the bridge sustain a far smoother rate.
    private let bridgeMaxPixelDimension: CGFloat = 720
    private let bridgeJpegQuality: CGFloat = 0.6
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

    /// Delivers JPEG base64 (no data-URL prefix) to the Capacitor plugin for canvas preview in the WebView.
    var onPreviewFrame: ((_ jpegBase64: String, _ width: Int, _ height: Int) -> Void)?

    /// Delivers mono Float32 PCM chunks (base64, sampleRate, sampleCount) for the JS pitch tracker.
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

    private override init() {
        super.init()
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

    /// Defensive resync used after any interruption/error/lifecycle event: if the
    /// session SHOULD be running (preview, bridge preview, or recording was
    /// active) but AVFoundation left it stopped — or hardware objects were
    /// invalidated by a media-services reset — rebuild and restart it. Cheap and
    /// idempotent when everything is already healthy, so callers can invoke it
    /// freely from any lifecycle hook.
    func ensureSessionHealthy(reason: String) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }

            let shouldBeActive = self.isPreviewActive || self.isBridgePreviewActive || self.isRecording
            guard shouldBeActive else { return }

            // Playback owns the AVAudioSession speaker route. Defer all health
            // work until playback ends — restarting or reconfiguring the capture
            // session mid-playback causes visible preview glitches on the JPEG
            // bridge. A brief hold on the last frame during a quick take preview
            // is preferable to stuttery recovery.
            if CameraSessionGuard.playbackRouteActive {
                self.deferredHealthCheckReason = reason
                return
            }

            if self.isRecording {
                // Never touch inputs/outputs mid-recording; AVFoundation will
                // usually resume the movie file output on its own once the
                // interruption clears. Just make sure the session is running.
                if !self.session.isRunning {
                    print("[NativeCameraRecovery][\(reason)] restarting session during active recording")
                    self.session.startRunning()
                }
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
                !self.needsFullReconfigureAfterMediaReset
            if isHealthy {
                return
            }

            print("[NativeCameraRecovery][\(reason)] session unhealthy — running recovery (isRunning=\(self.session.isRunning) configured=\(self.isSessionConfigured) needsRebuild=\(self.needsFullReconfigureAfterMediaReset))")

            if self.needsFullReconfigureAfterMediaReset || !self.isSessionConfigured {
                print("[NativeCameraRecovery][\(reason)] rebuilding capture session from scratch")
                do {
                    let configuredOutput = try self.configureCaptureSession(useFrontCamera: self.previewUsesFrontCamera)
                    self.movieOutput = configuredOutput
                    self.isSessionConfigured = true
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
        try profile.apply(to: session)

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
        session.isRunning && (isBridgePreviewActive || isPreviewActive || isRecording || isStarting)
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
                    do {
                        try self.configureAudioSessionForRecording(
                            profile: audioSessionProfile,
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
                        let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: audioSessionProfile)
                        DispatchQueue.main.async {
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

    func stopBridgePreview() {
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
        stopPreview()
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
                        try self.configureAudioSessionForRecording(
                            profile: audioSessionProfile,
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

    func stopPreview() {
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
            guard !self.isRecording, self.session.isRunning else { return }
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.stopPreview stopRunning.begin")
            self.session.stopRunning()
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.stopPreview stopRunning.end")
        }
    }

    func layoutPreview(in container: UIView) {
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
                connection.videoOrientation = .portrait
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

        session.sessionPreset = .high

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
                connection.videoOrientation = .portrait
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
        guard session.canAddOutput(videoDataOutput) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 12,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add video data output"]
            )
        }
        session.addOutput(videoDataOutput)
        self.videoDataOutput = videoDataOutput

        // Audio tap for the JS pitch tracker. iOS 16+ allows an audio data output
        // alongside AVCaptureMovieFileOutput (same coexistence rule the video data
        // output above relies on); degrade silently on older systems.
        let audioTapOutput = AVCaptureAudioDataOutput()
        audioTapOutput.setSampleBufferDelegate(self, queue: audioTapQueue)
        if session.canAddOutput(audioTapOutput) {
            session.addOutput(audioTapOutput)
            self.audioDataOutput = audioTapOutput
            print("[PitchTap] audio data output ADDED to capture session")
        } else {
            self.audioDataOutput = nil
            print("[PitchTap] audio data output UNAVAILABLE — canAddOutput=false (movie-file-output conflict). Pitch widget will have no native audio source.")
            AudioRouteConfigurator.debugCaptureEvent(
                "NativeCameraRecordingEngine.configureCaptureSession audioTapOutput.unavailable"
            )
        }

        if let connection = videoDataOutput.connection(with: .video) {
            if connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = false
            }
        }

        logActiveFormatDiagnostics(reason: "sessionConfigured")
        return movieOutput
    }

    func enableFrameBridge() {
        frameBridgeQueue.async {
            self.isFrameBridgeActive = true
            self.lastBridgeFrameTime = 0
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
            self.isFrameBridgeActive = false
            self.pendingBridgeSample = nil
            self.isBridgeEncoding = false
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

        let maxDim = max(sourceWidth, sourceHeight)
        let scale = min(1, bridgeMaxPixelDimension / maxDim)
        let outputWidth = Int(sourceWidth * scale)
        let outputHeight = Int(sourceHeight * scale)

        let scaledImage: CIImage
        if scale < 1 {
            scaledImage = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        } else {
            scaledImage = ciImage
        }

        let options: [CIImageRepresentationOption: Any] = [
            .init(rawValue: kCGImageDestinationLossyCompressionQuality as String): bridgeJpegQuality,
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
            activeMicInputPreference = micInputPreference
            do {
                _ = try AudioRouteConfigurator.applyMicInputPreferenceInputOnly(
                    micInputPreference,
                    caller: "startOnSessionQueue.previewActive"
                )
            } catch {
                print("[MicRouteProof] context=startOnSessionQueue.previewActive inputOnly apply failed: \(error.localizedDescription)")
            }
        }

        if !isSessionConfigured || movieOutput == nil || (isPreviewActive && previewUsesFrontCamera != useFrontCamera) || needsAudioPipelineRebuild {
            let configuredOutput = try configureCaptureSession(useFrontCamera: useFrontCamera)
            movieOutput = configuredOutput
            isSessionConfigured = true
            previewUsesFrontCamera = useFrontCamera
            needsAudioPipelineRebuild = false
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
        outputURL = fileURL

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

            let completion = self.startCompletion
            let result = self.pendingStartResult
            self.startCompletion = nil
            self.pendingStartResult = nil

            print("[NativeCameraTest] recording started")
            print("[NativeCameraTest] fileURL = \(fileURL.absoluteString)")
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

            if trimStartMs > 0 {
                self.trimVideo(sourceURL: outputFileURL, trimStartMs: trimStartMs) { trimResult in
                    self.sessionQueue.async {
                        switch trimResult {
                        case .success(let trimmedURL):
                            do {
                                try FileManager.default.removeItem(at: outputFileURL)
                                try FileManager.default.moveItem(at: trimmedURL, to: outputFileURL)
                                self.finalizeStopResult(for: outputFileURL, completion: completion)
                            } catch {
                                self.restoreAudioSessionAfterTest()
                                DispatchQueue.main.async {
                                    completion?(.failure(error))
                                }
                            }
                        case .failure(let trimError):
                            print("[NativeCameraTest] Trim failed: \(trimError.localizedDescription). Falling back to untrimmed.")
                            self.finalizeStopResult(for: outputFileURL, completion: completion)
                        }
                    }
                }
            } else {
                self.finalizeStopResult(for: outputFileURL, completion: completion)
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
        do {
            let info = try self.buildStopResult(for: fileURL)
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

    private func buildStopResult(for fileURL: URL) throws -> [String: Any] {
        let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
        let fileSize = (attributes[.size] as? NSNumber)?.intValue ?? 0

        let asset = AVURLAsset(url: fileURL)
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        let safeDuration = durationSeconds.isFinite && durationSeconds > 0 ? durationSeconds : 0

        var width = recordedVideoWidth
        var height = recordedVideoHeight
        if let videoTrack = asset.tracks(withMediaType: .video).first {
            let size = videoTrack.naturalSize.applying(videoTrack.preferredTransform)
            width = Int(abs(size.width))
            height = Int(abs(size.height))
        }

        let routeSnapshot = AudioRouteConfigurator.routeSnapshot()
        let route = routeSnapshot["outputPort"] as? String ?? "unknown"
        let relativePath = "takes/\(fileURL.lastPathComponent)"

        var result: [String: Any] = [
            "filePath": relativePath,
            "fileURL": fileURL.absoluteString,
            "duration": safeDuration,
            "fileSize": fileSize,
            "mimeType": "video/mp4",
            "width": width,
            "height": height,
            "route": route,
            "audioSessionProfile": activeAudioProfile.rawValue,
        ]

        if let levels = NativeCameraTestAudio.measureLevels(fileURL: fileURL) {
            NativeCameraTestAudio.logFileLevels(levels)
            for (key, value) in NativeCameraTestAudio.levelsPayload(levels) {
                result[key] = value
            }
        }

        let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: activeAudioProfile)
        for (key, value) in sessionInfo {
            result[key] = value
        }

        return result
    }
}

extension NativeCameraRecordingEngine {
    private func copySampleBuffer(_ sampleBuffer: CMSampleBuffer) -> CMSampleBuffer? {
        var copied: CMSampleBuffer?
        let status = CMSampleBufferCreateCopy(allocator: kCFAllocatorDefault, sampleBuffer: sampleBuffer, sampleBufferOut: &copied)
        guard status == noErr else { return nil }
        return copied
    }

    private func drainBridgeFrames() {
        guard isFrameBridgeActive, !isBridgeEncoding, let sample = pendingBridgeSample else { return }

        let now = CACurrentMediaTime()
        guard now - lastBridgeFrameTime >= (1.0 / bridgeFramesPerSecond) else { return }

        lastBridgeFrameTime = now
        pendingBridgeSample = nil
        isBridgeEncoding = true

        frameEncodeQueue.async { [weak self] in
            guard let self = self else { return }
            let payload = self.jpegPayload(from: sample, mirrored: false)
            let handler = self.onPreviewFrame

            DispatchQueue.main.async {
                if self.isFrameBridgeActive, let payload = payload {
                    handler?(payload.0, payload.1, payload.2)
                }
                self.isBridgeEncoding = false
                self.frameBridgeQueue.async {
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
            }
        }
    }

    /// Runs on audioTapQueue (the tap output's delegate queue).
    private func handleAudioTapSample(_ sampleBuffer: CMSampleBuffer) {
        guard isAudioTapEnabled else { return }
        if !didLogFirstTapSample {
            didLogFirstTapSample = true
            print("[PitchTap] FIRST audio sample received from capture session — tap is delivering")
        }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer),
              let asbdPointer = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription) else {
            return
        }
        let asbd = asbdPointer.pointee

        var blockBuffer: CMBlockBuffer?
        var bufferList = AudioBufferList()
        let status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
            sampleBuffer,
            bufferListSizeNeededOut: nil,
            bufferListOut: &bufferList,
            bufferListSize: MemoryLayout<AudioBufferList>.size,
            blockBufferAllocator: kCFAllocatorDefault,
            blockBufferMemoryAllocator: kCFAllocatorDefault,
            flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            blockBufferOut: &blockBuffer
        )
        guard status == noErr else { return }
        // blockBuffer must stay alive while we read the pointers below.
        defer { _ = blockBuffer }

        let buffers = UnsafeMutableAudioBufferListPointer(&bufferList)
        guard let firstBuffer = buffers.first, let rawData = firstBuffer.mData else { return }

        let channelCount = max(1, Int(asbd.mChannelsPerFrame))
        let isFloat = (asbd.mFormatFlags & kAudioFormatFlagIsFloat) != 0
        let isSignedInt = (asbd.mFormatFlags & kAudioFormatFlagIsSignedInteger) != 0
        // For non-interleaved formats the first buffer holds channel 0 only.
        let isNonInterleaved = (asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved) != 0
        let stride = isNonInterleaved ? 1 : channelCount

        var mono: [Float]
        if isFloat && asbd.mBitsPerChannel == 32 {
            let sampleCount = Int(firstBuffer.mDataByteSize) / MemoryLayout<Float>.size
            let samples = rawData.bindMemory(to: Float.self, capacity: sampleCount)
            let frames = sampleCount / stride
            mono = [Float](repeating: 0, count: frames)
            for frame in 0..<frames {
                mono[frame] = samples[frame * stride]
            }
        } else if isSignedInt && asbd.mBitsPerChannel == 16 {
            let sampleCount = Int(firstBuffer.mDataByteSize) / MemoryLayout<Int16>.size
            let samples = rawData.bindMemory(to: Int16.self, capacity: sampleCount)
            let frames = sampleCount / stride
            mono = [Float](repeating: 0, count: frames)
            for frame in 0..<frames {
                mono[frame] = Float(samples[frame * stride]) / 32768.0
            }
        } else {
            return
        }

        tapAccumulator.append(contentsOf: mono)
        let chunkSize = 2048
        while tapAccumulator.count >= chunkSize {
            let chunk = Array(tapAccumulator.prefix(chunkSize))
            tapAccumulator.removeFirst(chunkSize)
            let payload = chunk.withUnsafeBufferPointer { Data(buffer: $0) }
            onAudioTapChunk?(payload.base64EncodedString(), asbd.mSampleRate, chunkSize)
        }
    }
}
