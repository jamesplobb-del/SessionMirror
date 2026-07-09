import Foundation

/// Blocks AVAudioSession route mutations while the WebKit camera preview or recording is live.
enum CameraSessionGuard {
    private(set) static var previewActive = false
    private(set) static var recordingActive = false
    private(set) static var playbackRouteActive = false
    private(set) static var playbackSessionPrepared = false
    private(set) static var recordingMode = "video"

    static func setRecordingMode(_ mode: String) {
        recordingMode = mode
    }

    static var isCameraOrRecordingActive: Bool {
        recordingMode == "video" && (previewActive || recordingActive)
    }

    /// Timestamp of the most recent `applicationDidBecomeActive` /
    /// `applicationWillEnterForeground`. The JS↔native ownership handshake
    /// (camera bridge reacquire, playback-route release, Web Audio context
    /// resume) is asynchronous and takes several hundred ms to settle after
    /// resume — during that window a snapshot of "everything looks idle" can
    /// be stale rather than true. Without this grace period,
    /// `deactivateCaptureSessionIfIdle()` can immediately undo the session
    /// reactivation `AppDelegate` just performed on the same lifecycle event.
    private(set) static var lastForegroundActivationAt: CFAbsoluteTime = 0
    private static let foregroundGracePeriodSeconds: CFAbsoluteTime = 1.5

    static func markForegroundActivation() {
        lastForegroundActivationAt = CFAbsoluteTimeGetCurrent()
    }

    static var isWithinForegroundGracePeriod: Bool {
        CFAbsoluteTimeGetCurrent() - lastForegroundActivationAt < foregroundGracePeriodSeconds
    }

    static func setPreviewActive(_ active: Bool) {
        previewActive = active
        logOwnershipTransition(caller: "setPreviewActive(\(active))")
    }

    static func setRecordingActive(_ active: Bool) {
        recordingActive = active
        logOwnershipTransition(caller: "setRecordingActive(\(active))")
    }

    static func setPlaybackRouteActive(_ active: Bool) {
        playbackRouteActive = active
        if !active {
            playbackSessionPrepared = false
        }
        logOwnershipTransition(caller: "setPlaybackRouteActive(\(active))")
    }

    /// Diagnostic-only: surfaces the exact race the review-playback glitching
    /// traces back to — preview ownership (`previewActive`/`recordingActive`)
    /// and playback ownership (`playbackRouteActive`) becoming true
    /// SIMULTANEOUSLY, with no teardown handshake between them. When both are
    /// true, `shouldBlockRouteChanges()` is true for the entire overlap
    /// window, so every AVAudioSession route change playback tries to make is
    /// silently skipped, and any capture-session self-heal
    /// (`ensureSessionHealthy`) that runs during that window will rebuild the
    /// AVCaptureSession while playback is actively pulling on the same
    /// AVAudioSession. This does not change behavior — logging only.
    private static func logOwnershipTransition(caller: String) {
        if isCameraOrRecordingActive && playbackRouteActive {
            print(
                "[OwnershipConflict][\(caller)] preview/recording ownership and playback " +
                "ownership are BOTH active — previewActive=\(previewActive) " +
                "recordingActive=\(recordingActive) playbackRouteActive=\(playbackRouteActive). " +
                "Every route change is being skipped and any concurrent session " +
                "self-heal will rebuild the capture session mid-playback."
            )
        } else {
            print(
                "[OwnershipTransition][\(caller)] previewActive=\(previewActive) " +
                "recordingActive=\(recordingActive) playbackRouteActive=\(playbackRouteActive)"
            )
        }
    }

    static func markPlaybackSessionPrepared() {
        playbackSessionPrepared = true
    }

    static func canApplyPlaybackSession(allowWithActivePreview: Bool = false) -> Bool {
        if recordingMode == "audio" {
            return true
        }
        if !previewActive && !recordingActive {
            return true
        }
        return allowWithActivePreview && playbackRouteActive
    }

    static func shouldBlockRouteChanges() -> Bool {
        isCameraOrRecordingActive
    }

    static func shouldBlockDeviceMicChanges() -> Bool {
        isCameraOrRecordingActive || playbackRouteActive
    }

    static func snapshot() -> [String: Any] {
        [
            "previewActive": previewActive,
            "recordingActive": recordingActive,
            "playbackRouteActive": playbackRouteActive,
            "playbackSessionPrepared": playbackSessionPrepared,
        ]
    }

    static func skipRouteChangeLog() {
        print("[AudioRoute] skipped route change while camera active")
    }

    static func skipDeviceMicLog() {
        print("[AudioRoute] skipped device mic change during preview/playback overlap")
    }
}
