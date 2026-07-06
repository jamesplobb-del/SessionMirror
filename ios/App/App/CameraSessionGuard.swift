import Foundation

/// Blocks AVAudioSession route mutations while the WebKit camera preview or recording is live.
enum CameraSessionGuard {
    private(set) static var previewActive = false
    private(set) static var recordingActive = false
    private(set) static var playbackRouteActive = false
    private(set) static var playbackSessionPrepared = false

    static var isCameraOrRecordingActive: Bool {
        previewActive || recordingActive
    }

    static func setPreviewActive(_ active: Bool) {
        previewActive = active
    }

    static func setRecordingActive(_ active: Bool) {
        recordingActive = active
    }

    static func setPlaybackRouteActive(_ active: Bool) {
        playbackRouteActive = active
        if !active {
            playbackSessionPrepared = false
        }
    }

    static func markPlaybackSessionPrepared() {
        playbackSessionPrepared = true
    }

    static func canApplyPlaybackSession(allowWithActivePreview: Bool = false) -> Bool {
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
