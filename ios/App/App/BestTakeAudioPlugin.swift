import AVFoundation
import Capacitor
import PDFKit
import Photos
import UIKit

@objc(BestTakeAudioPlugin)
public class BestTakeAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BestTakeAudioPlugin"
    public let jsName = "BestTakeAudioPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setHighQualityBluetoothMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setDeviceMicForRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setBluetoothHeadphonePlaybackMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reapplyHeadphonePlaybackRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableStereoPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableRecordingRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackOutputProfile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativePlaybackTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativePlaybackTest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startInlineTakeBoxPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopInlineTakeBoxPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateInlineTakeBoxPlaybackLayout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setInlineTakeBoxPlaybackVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareCameraLikePlaybackSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCameraSessionState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCameraSessionState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPlaybackRouteActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restoreRecordingRouteAfterPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareMediaFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveVideoToPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "renderCreatorStudioVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "renderMultitrackVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeExperimentalAudioMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeCameraBridge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeCameraBridge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeCameraPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeCameraPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeCameraPassthrough", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeCameraFrameBridgeEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeCameraPreviewZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setNativeAudioTapEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ensureNativeCameraSessionHealthy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enhanceTakeAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startNativeCameraRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeCameraRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playNativeCameraTestPostProcess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopNativeCameraTestPostProcess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hapticImpact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hapticNotification", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareHaptics", returnType: CAPPluginReturnPromise),
    ]

    private let nativeCameraEngine = NativeCameraRecordingEngine.shared
    private var routeObserver: NSObjectProtocol?
    private var nativeTestPlayer: AVPlayer?
    private var nativeTestEndObserver: NSObjectProtocol?
    private var playbackRouteRestorePending = false

    // MARK: - Haptics
    // Pre-instantiated feedback generators kept warm via prepare() so every
    // tap fires crisply and immediately. Dynamically importing a JS haptics
    // module per tap (the old path) let the Taptic Engine idle between taps,
    // which is what made haptics feel weak / dropped ("dwindling").
    private lazy var impactGenerators: [String: UIImpactFeedbackGenerator] = {
        var generators: [String: UIImpactFeedbackGenerator] = [
            "light": UIImpactFeedbackGenerator(style: .light),
            "medium": UIImpactFeedbackGenerator(style: .medium),
            "heavy": UIImpactFeedbackGenerator(style: .heavy),
        ]
        if #available(iOS 13.0, *) {
            generators["soft"] = UIImpactFeedbackGenerator(style: .soft)
            generators["rigid"] = UIImpactFeedbackGenerator(style: .rigid)
        }
        return generators
    }()
    private lazy var notificationGenerator = UINotificationFeedbackGenerator()

    override public func load() {
        super.load()
        nativeCameraEngine.onPreviewFrame = { [weak self] jpegBase64, width, height in
            self?.notifyListeners("nativeCameraPreviewFrame", data: [
                "jpegBase64": jpegBase64,
                "width": width,
                "height": height,
            ])
        }
        nativeCameraEngine.onAudioTapChunk = { [weak self] pcmBase64, sampleRate, sampleCount in
            self?.notifyListeners("nativeAudioPitchFrame", data: [
                "pcmBase64": pcmBase64,
                "sampleRate": sampleRate,
                "sampleCount": sampleCount,
            ])
        }
        routeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] _ in
            AudioRouteConfigurator.logRoute("route-change event")
            guard let self = self else { return }
            self.notifyListeners("audioRouteChanged", data: AudioRouteConfigurator.routeSnapshot())
        }
        DispatchQueue.main.async { [weak self] in
            self?.warmHaptics()
        }
    }

    // MARK: - Haptics

    private func warmHaptics() {
        for generator in impactGenerators.values {
            generator.prepare()
        }
        notificationGenerator.prepare()
    }

    @objc func hapticImpact(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "medium"
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve()
                return
            }
            let generator = self.impactGenerators[style] ?? self.impactGenerators["medium"]
            generator?.impactOccurred()
            // Re-prime immediately so the next tap is just as crisp.
            generator?.prepare()
            call.resolve()
        }
    }

    @objc func hapticNotification(_ call: CAPPluginCall) {
        let typeRaw = call.getString("type") ?? "success"
        let type: UINotificationFeedbackGenerator.FeedbackType
        switch typeRaw {
        case "warning": type = .warning
        case "error": type = .error
        default: type = .success
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                call.resolve()
                return
            }
            self.notificationGenerator.notificationOccurred(type)
            self.notificationGenerator.prepare()
            call.resolve()
        }
    }

    @objc func prepareHaptics(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.warmHaptics()
            call.resolve()
        }
    }

    deinit {
        stopNativePlaybackTestPlayer()
        if let routeObserver = routeObserver {
            NotificationCenter.default.removeObserver(routeObserver)
        }
    }

    @objc func setHighQualityBluetoothMode(_ call: CAPPluginCall) {
        let enableHQ = call.getBool("enable") ?? false

        if CameraSessionGuard.shouldBlockRouteChanges() {
            CameraSessionGuard.skipRouteChangeLog()
            call.resolve(AudioRouteConfigurator.routeSnapshot())
            return
        }

        do {
            try AudioRouteConfigurator.applyRecordingRoute(enableHQ: enableHQ)
            var result = AudioRouteConfigurator.routeSnapshot()
            result["success"] = true
            call.resolve(result)
        } catch {
            print("BestTake Audio Error: \(error.localizedDescription)")
            call.reject("Audio routing failed: \(error.localizedDescription)")
        }
    }

    @objc func setDeviceMicForRecording(_ call: CAPPluginCall) {
        let preference = AudioRouteConfigurator.parseMicInputPreference(call.getString("preference"))
        let legacyEnable = call.getBool("enable")
        let resolvedPreference: AudioRouteConfigurator.MicInputPreference = legacyEnable == nil
            ? preference
            : (legacyEnable == true ? .iphone : .auto)

        if CameraSessionGuard.shouldBlockDeviceMicChanges() {
            CameraSessionGuard.skipDeviceMicLog()
            var snapshot = AudioRouteConfigurator.routeSnapshot()
            snapshot["success"] = true
            snapshot["selectedMicPreference"] = resolvedPreference.rawValue
            snapshot["queued"] = true
            print("[MicInputPreference] queued selected=\(resolvedPreference.rawValue) reason=input preference blocked during preview/playback overlap")
            call.resolve(snapshot)
            return
        }

        if CameraSessionGuard.shouldBlockRouteChanges() {
            CameraSessionGuard.skipRouteChangeLog()
            var snapshot = AudioRouteConfigurator.routeSnapshot()
            snapshot["success"] = true
            snapshot["selectedMicPreference"] = resolvedPreference.rawValue
            snapshot["queued"] = true
            print("[MicInputPreference] queued selected=\(resolvedPreference.rawValue) reason=route change blocked while camera preview or recording is active")
            call.resolve(snapshot)
            return
        }

        do {
            let result = try AudioRouteConfigurator.setMicInputPreference(resolvedPreference)
            call.resolve(result)
        } catch {
            print("BestTake Audio Error: \(error.localizedDescription)")
            call.reject("Mic input preference failed: \(error.localizedDescription)")
        }
    }

    @objc func setBluetoothHeadphonePlaybackMode(_ call: CAPPluginCall) {
        let enable = call.getBool("enable") ?? false
        let applyRoute = call.getBool("applyRoute") ?? false

        do {
            try AudioRouteConfigurator.setHeadphonePlaybackMode(enable, applyRoute: applyRoute)
            var result = AudioRouteConfigurator.routeSnapshot()
            result["success"] = true
            call.resolve(result)
        } catch {
            print("BestTake Audio Error: \(error.localizedDescription)")
            call.reject("Headphone playback mode routing failed: \(error.localizedDescription)")
        }
    }

    @objc func reapplyHeadphonePlaybackRoute(_ call: CAPPluginCall) {
        guard AudioRouteConfigurator.isHeadphonePlaybackModeEnabled() else {
            call.resolve(AudioRouteConfigurator.routeSnapshot())
            return
        }

        do {
            try AudioRouteConfigurator.applyHeadphonePlaybackRoute()
            var result = AudioRouteConfigurator.routeSnapshot()
            result["success"] = true
            call.resolve(result)
        } catch {
            print("BestTake Audio Error: \(error.localizedDescription)")
            call.reject("Headphone playback route reapply failed: \(error.localizedDescription)")
        }
    }

    @objc func enableStereoPlayback(_ call: CAPPluginCall) {
        do {
            let result: [String: Any]
            // YouTube and other iframe playback use this path without
            // playbackRouteActive — coexistent speaker override is safe
            // whenever the camera capture session is live.
            if CameraSessionGuard.isCameraOrRecordingActive {
                result = try AudioRouteConfigurator.applyCoexistentPlaybackSpeakerRoute()
            } else {
                result = try AudioRouteConfigurator.applyWebPlaybackRoute(webPlaybackActive: true)
            }
            call.resolve(result)
        } catch {
            call.reject("Failed to set stereo playback", nil, error)
        }
    }

    @objc func enableRecordingRoute(_ call: CAPPluginCall) {
        if CameraSessionGuard.shouldBlockRouteChanges() {
            CameraSessionGuard.skipRouteChangeLog()
            call.resolve()
            return
        }

        do {
            try AudioRouteConfigurator.applyRecordingRoute(
                enableHQ: AudioRouteConfigurator.shouldUseHighQualityRoute()
            )
            call.resolve()
        } catch {
            call.reject("Failed to set recording route", error.localizedDescription)
        }
    }

    @objc func getPlaybackOutputProfile(_ call: CAPPluginCall) {
        let snapshot = AudioRouteConfigurator.routeSnapshot()
        var result = snapshot
        let headphonePorts: Set<String> = [
            AVAudioSession.Port.bluetoothA2DP.rawValue,
            AVAudioSession.Port.bluetoothHFP.rawValue,
            AVAudioSession.Port.bluetoothLE.rawValue,
            AVAudioSession.Port.headphones.rawValue,
            AVAudioSession.Port.headsetMic.rawValue,
            AVAudioSession.Port.airPlay.rawValue,
        ]
        let outputPort = snapshot["outputPort"] as? String ?? "unknown"
        result["usesHeadphones"] = headphonePorts.contains(outputPort)
        result["portType"] = outputPort
        call.resolve(result)
    }

    // MARK: - Native playback A/B test (AVPlayer — bypasses WKWebView / Web Audio)

    private func stopNativePlaybackTestPlayer() {
        if let nativeTestEndObserver = nativeTestEndObserver {
            NotificationCenter.default.removeObserver(nativeTestEndObserver)
            self.nativeTestEndObserver = nil
        }
        nativeTestPlayer?.pause()
        nativeTestPlayer = nil
    }

    private func applyCameraLikePlaybackSessionOrReject(_ call: CAPPluginCall) -> Bool {
        do {
            _ = try NativeCameraTestAudio.prepareCameraLikePlaybackSession()
            return true
        } catch {
            if CameraSessionGuard.shouldBlockRouteChanges() {
                CameraSessionGuard.skipRouteChangeLog()
            }
            call.reject("Failed to configure camera-like playback session", nil, error)
            return false
        }
    }

    private func finishPlaybackRouteIfNeeded() {
        guard playbackRouteRestorePending else { return }
        playbackRouteRestorePending = false
        CameraSessionGuard.setPlaybackRouteActive(false)
        nativeCameraEngine.runDeferredHealthCheckIfNeeded()

        print("[PlaybackRoute] playback ended")
        print("[PlaybackRoute] restoring camera session")

        do {
            try AudioRouteConfigurator.applyRecordingRoute(
                enableHQ: AudioRouteConfigurator.shouldUseHighQualityRoute()
            )
        } catch {
            print("[PlaybackRoute] failed to restore recording route: \(error.localizedDescription)")
        }

        notifyListeners("playbackRouteEnded", data: [:])
    }

    /// Defensive resync callable from JS on any foreground/idle-wake path. Cheap
    /// and idempotent: only rebuilds/restarts the native capture session when it
    /// should currently be active but AVFoundation left it stopped or invalid
    /// (phone lock, Control Center camera takeover, mediaServicesWereReset, long
    /// background idle). No-op if nothing native is active.
    @objc func ensureNativeCameraSessionHealthy(_ call: CAPPluginCall) {
        nativeCameraEngine.ensureSessionHealthy(reason: "js-request")
        call.resolve(CameraSessionGuard.snapshot())
    }

    @objc func setCameraSessionState(_ call: CAPPluginCall) {
        let previewActive = call.getBool("previewActive") ?? false
        let recordingActive = call.getBool("recordingActive") ?? false

        if CameraSessionGuard.playbackRouteActive {
            if previewActive || recordingActive {
                call.resolve(CameraSessionGuard.snapshot())
                return
            }
            CameraSessionGuard.setPreviewActive(false)
            CameraSessionGuard.setRecordingActive(false)
            call.resolve(CameraSessionGuard.snapshot())
            return
        }

        CameraSessionGuard.setPreviewActive(previewActive)
        CameraSessionGuard.setRecordingActive(recordingActive)

        if !previewActive && !recordingActive && !CameraSessionGuard.playbackRouteActive {
            if nativeCameraEngine.requiresActiveAudioSession {
                call.resolve(CameraSessionGuard.snapshot())
                return
            }
            do {
                try AudioRouteConfigurator.deactivateCaptureSessionIfIdle()
            } catch {
                print("[AudioRoute] failed to deactivate idle capture session: \(error.localizedDescription)")
            }
        }

        call.resolve(CameraSessionGuard.snapshot())
    }

    @objc func getCameraSessionState(_ call: CAPPluginCall) {
        call.resolve(CameraSessionGuard.snapshot())
    }

    @objc func setPlaybackRouteActive(_ call: CAPPluginCall) {
        let active = call.getBool("active") ?? false
        CameraSessionGuard.setPlaybackRouteActive(active)
        if !active {
            // Playback just released AVAudioSession ownership — replay any
            // capture-session health check that was deferred while playback
            // owned the session, instead of leaving it unrecovered.
            nativeCameraEngine.runDeferredHealthCheckIfNeeded()
        }
        call.resolve(CameraSessionGuard.snapshot())
    }

    @objc func restoreRecordingRouteAfterPlayback(_ call: CAPPluginCall) {
        if playbackRouteRestorePending {
            finishPlaybackRouteIfNeeded()
        } else {
            print("[PlaybackRoute] playback ended")
            print("[PlaybackRoute] restoring camera session")
            do {
                try AudioRouteConfigurator.applyRecordingRoute(
                    enableHQ: AudioRouteConfigurator.shouldUseHighQualityRoute()
                )
            } catch {
                print("[PlaybackRoute] failed to restore recording route: \(error.localizedDescription)")
            }
        }
        call.resolve(AudioRouteConfigurator.routeSnapshot())
    }

    private func fileURL(from path: String?) -> URL? {
        guard let path = path, !path.isEmpty else { return nil }
        if let url = URL(string: path), url.isFileURL {
            return url
        }
        return URL(fileURLWithPath: path)
    }

    private func amplifiedExportURL(
        from sourceURL: URL,
        audioGain: Float,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        guard audioGain > 1.01 else {
            completion(.success(sourceURL))
            return
        }

        let asset = AVURLAsset(url: sourceURL)
        guard !asset.tracks(withMediaType: .audio).isEmpty else {
            completion(.success(sourceURL))
            return
        }

        let composition = AVMutableComposition()

        do {
            for sourceTrack in asset.tracks(withMediaType: .video) {
                guard let compositionTrack = composition.addMutableTrack(
                    withMediaType: .video,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                ) else { continue }
                try compositionTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: asset.duration),
                    of: sourceTrack,
                    at: .zero
                )
                compositionTrack.preferredTransform = sourceTrack.preferredTransform
            }

            var audioParameters: [AVMutableAudioMixInputParameters] = []
            for sourceTrack in asset.tracks(withMediaType: .audio) {
                guard let compositionTrack = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                ) else { continue }
                try compositionTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: asset.duration),
                    of: sourceTrack,
                    at: .zero
                )
                let resolvedGain = min(max(audioGain, 1.0), 4.5)
                let parameters = AVMutableAudioMixInputParameters(track: compositionTrack)
                parameters.setVolume(resolvedGain, at: .zero)
                audioParameters.append(parameters)
            }

            guard let exportSession = AVAssetExportSession(
                asset: composition,
                presetName: AVAssetExportPresetHighestQuality
            ) else {
                completion(.success(sourceURL))
                return
            }

            let audioMix = AVMutableAudioMix()
            audioMix.inputParameters = audioParameters
            exportSession.audioMix = audioMix
            exportSession.outputFileType = .mp4
            exportSession.shouldOptimizeForNetworkUse = true

            let outputURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("besttake-export-\(UUID().uuidString).mp4")
            try? FileManager.default.removeItem(at: outputURL)
            exportSession.outputURL = outputURL

            print("[NativeExport] audioGain requested=\(audioGain) applied=\(min(max(audioGain, 1.0), 4.5)) source=\(sourceURL.lastPathComponent)")

            exportSession.exportAsynchronously {
                DispatchQueue.main.async {
                    if exportSession.status == .completed {
                        completion(.success(outputURL))
                    } else if let error = exportSession.error {
                        completion(.failure(error))
                    } else {
                        completion(.success(sourceURL))
                    }
                }
            }
        } catch {
            completion(.failure(error))
        }
    }

    private func creatorStudioRenderSize(for aspectRatio: String) -> CGSize {
        switch aspectRatio {
        case "1:1":
            return CGSize(width: 1080, height: 1080)
        case "16:9":
            return CGSize(width: 1920, height: 1080)
        default:
            return CGSize(width: 1080, height: 1920)
        }
    }

    private func transformDictionary(_ object: [String: Any]) -> [String: Any] {
        return object["transform"] as? [String: Any] ?? [:]
    }

    private func percentValue(_ value: Any?, fallback: CGFloat) -> CGFloat {
        if let value = value as? Double { return CGFloat(value) }
        if let value = value as? NSNumber { return CGFloat(truncating: value) }
        return fallback
    }

    private func creatorStudioLayerFrame(
        object: [String: Any],
        renderSize: CGSize,
        defaultHeightRatio: CGFloat
    ) -> CGRect {
        let transform = transformDictionary(object)
        let widthPercent = percentValue(transform["width"], fallback: 70)
        let xPercent = percentValue(transform["x"], fallback: 50)
        let yPercent = percentValue(transform["y"], fallback: 50)
        let scale = max(0.1, percentValue(transform["scale"], fallback: 1))

        let width = renderSize.width * (widthPercent / 100) * scale
        let height = width * defaultHeightRatio
        let centerX = renderSize.width * (xPercent / 100)
        let centerY = renderSize.height * (yPercent / 100)
        return CGRect(x: centerX - width / 2, y: centerY - height / 2, width: width, height: height)
    }

    private func applyLayerRotation(_ layer: CALayer, object: [String: Any]) {
        let transform = transformDictionary(object)
        let degrees = percentValue(transform["rotation"], fallback: 0)
        guard abs(degrees) > 0.01 else { return }
        layer.setAffineTransform(CGAffineTransform(rotationAngle: degrees * .pi / 180))
    }

    private func imageForCreatorStudioAsset(path: String, fileType: String) -> UIImage? {
        guard let url = fileURL(from: path) else { return nil }
        if fileType == "pdf" {
            guard let document = PDFDocument(url: url), let page = document.page(at: 0) else {
                return nil
            }
            let bounds = page.bounds(for: .mediaBox)
            let scale: CGFloat = 2
            let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
            let renderer = UIGraphicsImageRenderer(size: size)
            return renderer.image { context in
                UIColor.white.set()
                context.fill(CGRect(origin: .zero, size: size))
                context.cgContext.saveGState()
                context.cgContext.translateBy(x: 0, y: size.height)
                context.cgContext.scaleBy(x: scale, y: -scale)
                page.draw(with: .mediaBox, to: context.cgContext)
                context.cgContext.restoreGState()
            }
        }
        return UIImage(contentsOfFile: url.path)
    }

    /// Undoes a track's `preferredTransform` (device-rotation metadata) so its
    /// pixels are in upright, natural orientation — shared by both the
    /// single-video Creator Studio transform and the multitrack grid transform.
    private func normalizedTrackOrientation(_ track: AVAssetTrack) -> (transform: CGAffineTransform, orientedSize: CGSize) {
        let preferred = track.preferredTransform
        let naturalRect = CGRect(origin: .zero, size: track.naturalSize).applying(preferred)
        let orientedSize = CGSize(width: abs(naturalRect.width), height: abs(naturalRect.height))
        let normalize = preferred.concatenating(
            CGAffineTransform(translationX: -naturalRect.origin.x, y: -naturalRect.origin.y)
        )
        return (normalize, orientedSize)
    }

    private func creatorStudioVideoTransform(
        track: AVAssetTrack,
        renderSize: CGSize
    ) -> CGAffineTransform {
        let (normalize, orientedSize) = normalizedTrackOrientation(track)
        let scale = max(renderSize.width / max(orientedSize.width, 1), renderSize.height / max(orientedSize.height, 1))
        let scaledSize = CGSize(width: orientedSize.width * scale, height: orientedSize.height * scale)
        let translate = CGAffineTransform(
            translationX: (renderSize.width - scaledSize.width) / 2,
            y: (renderSize.height - scaledSize.height) / 2
        )
        return normalize
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(translate)
    }

    private func multitrackRectFrame(_ rectDict: [String: Any], renderSize: CGSize) -> CGRect {
        let x = percentValue(rectDict["xPercent"], fallback: 0) / 100 * renderSize.width
        let y = percentValue(rectDict["yPercent"], fallback: 0) / 100 * renderSize.height
        let width = percentValue(rectDict["widthPercent"], fallback: 100) / 100 * renderSize.width
        let height = percentValue(rectDict["heightPercent"], fallback: 100) / 100 * renderSize.height
        return CGRect(x: x, y: y, width: width, height: height)
    }

    /// Contain-fits (letterboxes) each source within its grid cell rather than
    /// cover-cropping. AVFoundation's per-layer-instruction crop rectangle has
    /// coordinate-space subtleties around `preferredTransform` that are hard to
    /// verify without on-device testing, so v1 avoids any risk of one panel's
    /// video bleeding into an adjacent cell by guaranteeing every source stays
    /// fully within its own target rect. Revisit with true cover-fit + cropping
    /// once verified live on device.
    private func multitrackVideoTransform(track: AVAssetTrack, targetRect: CGRect) -> CGAffineTransform {
        let (normalize, orientedSize) = normalizedTrackOrientation(track)
        let scale = min(targetRect.width / max(orientedSize.width, 1), targetRect.height / max(orientedSize.height, 1))
        let scaledSize = CGSize(width: orientedSize.width * scale, height: orientedSize.height * scale)
        let translate = CGAffineTransform(
            translationX: targetRect.origin.x + (targetRect.width - scaledSize.width) / 2,
            y: targetRect.origin.y + (targetRect.height - scaledSize.height) / 2
        )
        return normalize
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(translate)
    }

    private func addCreatorStudioObjectLayer(
        _ object: [String: Any],
        to overlayLayer: CALayer,
        renderSize: CGSize
    ) {
        guard let kind = object["kind"] as? String else { return }

        if kind == "sheetMusic" {
            guard
                let path = object["path"] as? String,
                let image = imageForCreatorStudioAsset(
                    path: path,
                    fileType: object["fileType"] as? String ?? "image"
                )
            else { return }
            let imageRatio = image.size.height / max(image.size.width, 1)
            let layer = CALayer()
            layer.contents = image.cgImage
            layer.contentsGravity = .resizeAspect
            layer.masksToBounds = true
            layer.cornerRadius = 18
            layer.borderColor = UIColor.white.withAlphaComponent(0.55).cgColor
            layer.borderWidth = 2
            layer.frame = creatorStudioLayerFrame(
                object: object,
                renderSize: renderSize,
                defaultHeightRatio: imageRatio
            )
            applyLayerRotation(layer, object: object)
            overlayLayer.addSublayer(layer)
            return
        }

        if kind == "text" || kind == "watermark" {
            guard let text = object["text"] as? String, !text.isEmpty else { return }
            let frame = creatorStudioLayerFrame(
                object: object,
                renderSize: renderSize,
                defaultHeightRatio: kind == "watermark" ? 0.28 : 0.22
            )
            let textLayer = CATextLayer()
            textLayer.frame = frame
            textLayer.string = text
            textLayer.alignmentMode = .center
            textLayer.contentsScale = UIScreen.main.scale
            textLayer.isWrapped = true
            textLayer.foregroundColor = UIColor.white.cgColor
            textLayer.shadowColor = UIColor.black.cgColor
            textLayer.shadowOpacity = 0.55
            textLayer.shadowRadius = 8
            textLayer.shadowOffset = CGSize(width: 0, height: 2)
            let fontSize = max(28, min(78, frame.height * 0.48))
            textLayer.font = UIFont.systemFont(ofSize: fontSize, weight: kind == "watermark" ? .bold : .heavy)
            textLayer.fontSize = fontSize

            if kind == "watermark" {
                textLayer.backgroundColor = UIColor.black.withAlphaComponent(0.34).cgColor
                textLayer.cornerRadius = frame.height / 2
                textLayer.masksToBounds = true
            }

            applyLayerRotation(textLayer, object: object)
            overlayLayer.addSublayer(textLayer)
        }
    }

    @objc func renderCreatorStudioVideo(_ call: CAPPluginCall) {
        guard let sourceURL = fileURL(from: call.getString("sourcePath")) else {
            call.reject("Missing source video")
            return
        }

        let aspectRatio = call.getString("aspectRatio") ?? "9:16"
        let renderSize = creatorStudioRenderSize(for: aspectRatio)
        let trimStartPercent = max(0, min(100, call.getDouble("trimStartPercent") ?? 0))
        let trimEndPercentRaw = call.getDouble("trimEndPercent")
        let trimEndPercent = trimEndPercentRaw == nil ? 100 : max(0, min(100, trimEndPercentRaw ?? 100))
        let audioGain = Float(call.getDouble("audioGain") ?? 1.0)
        let objects = call.getArray("objects", JSObject.self) ?? []

        let asset = AVURLAsset(url: sourceURL)
        guard let videoTrack = asset.tracks(withMediaType: .video).first else {
            call.reject("Source video has no video track")
            return
        }

        let durationSeconds = max(CMTimeGetSeconds(asset.duration), 0.01)
        let startSeconds = durationSeconds * trimStartPercent / 100
        let endSeconds = max(startSeconds + 0.05, durationSeconds * trimEndPercent / 100)
        let timeRange = CMTimeRange(
            start: CMTime(seconds: startSeconds, preferredTimescale: 600),
            end: CMTime(seconds: min(endSeconds, durationSeconds), preferredTimescale: 600)
        )

        let composition = AVMutableComposition()
        do {
            guard let compositionVideo = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else {
                call.reject("Could not create video composition track")
                return
            }
            try compositionVideo.insertTimeRange(timeRange, of: videoTrack, at: .zero)

            var audioParameters: [AVMutableAudioMixInputParameters] = []
            for audioTrack in asset.tracks(withMediaType: .audio) {
                guard let compositionAudio = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                ) else { continue }
                try compositionAudio.insertTimeRange(timeRange, of: audioTrack, at: .zero)
                let parameters = AVMutableAudioMixInputParameters(track: compositionAudio)
                parameters.setVolume(min(max(audioGain, 1.0), 4.5), at: .zero)
                audioParameters.append(parameters)
            }

            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = CMTimeRange(start: .zero, duration: timeRange.duration)
            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideo)
            layerInstruction.setTransform(
                creatorStudioVideoTransform(track: videoTrack, renderSize: renderSize),
                at: .zero
            )
            instruction.layerInstructions = [layerInstruction]

            let videoComposition = AVMutableVideoComposition()
            videoComposition.renderSize = renderSize
            videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
            videoComposition.instructions = [instruction]

            let parentLayer = CALayer()
            parentLayer.frame = CGRect(origin: .zero, size: renderSize)
            parentLayer.isGeometryFlipped = true
            parentLayer.backgroundColor = UIColor.black.cgColor

            let videoLayer = CALayer()
            videoLayer.frame = parentLayer.bounds
            parentLayer.addSublayer(videoLayer)

            let overlayLayer = CALayer()
            overlayLayer.frame = parentLayer.bounds
            parentLayer.addSublayer(overlayLayer)

            for object in objects {
                let nativeObject = object as [String: Any]
                if nativeObject["kind"] as? String == "recording" { continue }
                addCreatorStudioObjectLayer(nativeObject, to: overlayLayer, renderSize: renderSize)
            }

            videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
                postProcessingAsVideoLayer: videoLayer,
                in: parentLayer
            )

            guard let exportSession = AVAssetExportSession(
                asset: composition,
                presetName: AVAssetExportPresetHighestQuality
            ) else {
                call.reject("Could not create export session")
                return
            }

            let audioMix = AVMutableAudioMix()
            audioMix.inputParameters = audioParameters
            exportSession.audioMix = audioMix
            exportSession.videoComposition = videoComposition
            exportSession.outputFileType = .mp4
            exportSession.shouldOptimizeForNetworkUse = true

            let outputURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("besttake-creator-studio-\(UUID().uuidString).mp4")
            try? FileManager.default.removeItem(at: outputURL)
            exportSession.outputURL = outputURL

            print("[CreatorStudio] native render start objects=\(objects.count) aspect=\(aspectRatio) source=\(sourceURL.lastPathComponent)")
            exportSession.exportAsynchronously {
                DispatchQueue.main.async {
                    if exportSession.status == .completed {
                        print("[CreatorStudio] native render complete path=\(outputURL.path)")
                        call.resolve([
                            "success": true,
                            "path": outputURL.absoluteString
                        ])
                    } else if let error = exportSession.error {
                        print("[CreatorStudio] native render failed: \(error.localizedDescription)")
                        call.reject("Creator Studio render failed", error.localizedDescription)
                    } else {
                        call.reject("Creator Studio render failed")
                    }
                }
            }
        } catch {
            call.reject("Creator Studio render failed", error.localizedDescription)
        }
    }

    // MARK: - Multitrack grid export (N synced videos + optional sheet music + mixed audio)

    @objc func renderMultitrackVideo(_ call: CAPPluginCall) {
        let aspectRatio = call.getString("aspectRatio") ?? "9:16"
        let renderSize = creatorStudioRenderSize(for: aspectRatio)
        let durationHint = call.getDouble("durationSeconds") ?? 0
        let sources = call.getArray("sources", JSObject.self) ?? []

        guard !sources.isEmpty else {
            call.reject("No performance videos to export")
            return
        }

        let composition = AVMutableComposition()
        var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = []
        var audioParameters: [AVMutableAudioMixInputParameters] = []
        var longestDuration = CMTime.zero

        for sourceAny in sources {
            let source = sourceAny as [String: Any]
            guard
                let path = source["path"] as? String,
                let sourceURL = fileURL(from: path),
                let rectDict = source["rect"] as? [String: Any]
            else { continue }

            let asset = AVURLAsset(url: sourceURL)
            guard let videoTrack = asset.tracks(withMediaType: .video).first else {
                print("[Multitrack] skipping unreadable source \(source["id"] ?? "?")")
                continue
            }

            guard let compositionVideo = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else { continue }

            let sourceTimeRange = CMTimeRange(start: .zero, duration: asset.duration)
            do {
                try compositionVideo.insertTimeRange(sourceTimeRange, of: videoTrack, at: .zero)
            } catch {
                print("[Multitrack] failed to insert video source \(source["id"] ?? "?"): \(error.localizedDescription)")
                continue
            }
            longestDuration = CMTimeMaximum(longestDuration, asset.duration)

            let targetRect = multitrackRectFrame(rectDict, renderSize: renderSize)
            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideo)
            layerInstruction.setTransform(
                multitrackVideoTransform(track: videoTrack, targetRect: targetRect),
                at: .zero
            )
            layerInstructions.append(layerInstruction)

            for audioTrack in asset.tracks(withMediaType: .audio) {
                guard let compositionAudio = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                ) else { continue }
                do {
                    try compositionAudio.insertTimeRange(sourceTimeRange, of: audioTrack, at: .zero)
                    let parameters = AVMutableAudioMixInputParameters(track: compositionAudio)
                    parameters.setVolume(1.0, at: .zero)
                    audioParameters.append(parameters)
                } catch {
                    print("[Multitrack] failed to insert audio for source \(source["id"] ?? "?"): \(error.localizedDescription)")
                }
            }
        }

        guard !layerInstructions.isEmpty else {
            call.reject("None of the panel videos could be read")
            return
        }

        if let backingDict = call.getObject("backingAudio"),
           let backingPath = backingDict["path"] as? String,
           let backingURL = fileURL(from: backingPath) {
            let backingAsset = AVURLAsset(url: backingURL)
            if let backingTrack = backingAsset.tracks(withMediaType: .audio).first {
                // Backing audio never extends the export past the panels' own
                // duration — trim it down if it's longer (e.g. a full song).
                let backingDuration = min(backingAsset.duration, longestDuration)
                let backingRange = CMTimeRange(start: .zero, duration: backingDuration)
                if let compositionBacking = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                ) {
                    do {
                        try compositionBacking.insertTimeRange(backingRange, of: backingTrack, at: .zero)
                        let gain = Float(backingDict["gain"] as? Double ?? 1.0)
                        let parameters = AVMutableAudioMixInputParameters(track: compositionBacking)
                        parameters.setVolume(gain, at: .zero)
                        audioParameters.append(parameters)
                    } catch {
                        print("[Multitrack] failed to insert backing audio: \(error.localizedDescription)")
                    }
                }
            }
        }

        let instruction = AVMutableVideoCompositionInstruction()
        // Extend to the longest panel rather than crop to the shortest — a
        // panel that finished recording early just goes black/silent past its
        // own end instead of truncating footage from a longer panel.
        instruction.timeRange = CMTimeRange(start: .zero, duration: longestDuration)
        instruction.layerInstructions = layerInstructions

        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
        videoComposition.instructions = [instruction]

        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: renderSize)
        parentLayer.isGeometryFlipped = true
        parentLayer.backgroundColor = UIColor.black.cgColor

        let videoLayer = CALayer()
        videoLayer.frame = parentLayer.bounds
        parentLayer.addSublayer(videoLayer)

        if let sheetMusicDict = call.getObject("sheetMusic"),
           let sheetPath = sheetMusicDict["path"] as? String,
           let sheetRectDict = sheetMusicDict["rect"] as? [String: Any],
           let image = imageForCreatorStudioAsset(
                path: sheetPath,
                fileType: sheetMusicDict["fileType"] as? String ?? "image"
           ) {
            let overlayLayer = CALayer()
            overlayLayer.frame = parentLayer.bounds
            parentLayer.addSublayer(overlayLayer)

            let sheetLayer = CALayer()
            sheetLayer.contents = image.cgImage
            sheetLayer.contentsGravity = .resizeAspect
            sheetLayer.masksToBounds = true
            sheetLayer.cornerRadius = 18
            sheetLayer.borderColor = UIColor.white.withAlphaComponent(0.55).cgColor
            sheetLayer.borderWidth = 2
            sheetLayer.frame = multitrackRectFrame(sheetRectDict, renderSize: renderSize)
            overlayLayer.addSublayer(sheetLayer)
        }

        videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer,
            in: parentLayer
        )

        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            call.reject("Could not create export session")
            return
        }

        let audioMix = AVMutableAudioMix()
        audioMix.inputParameters = audioParameters
        exportSession.audioMix = audioMix
        exportSession.videoComposition = videoComposition
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("besttake-multitrack-\(UUID().uuidString).mp4")
        try? FileManager.default.removeItem(at: outputURL)
        exportSession.outputURL = outputURL

        print("[Multitrack] native render start sources=\(layerInstructions.count) aspect=\(aspectRatio) durationHint=\(durationHint)")
        exportSession.exportAsynchronously {
            DispatchQueue.main.async {
                if exportSession.status == .completed {
                    print("[Multitrack] native render complete path=\(outputURL.path)")
                    call.resolve([
                        "success": true,
                        "path": outputURL.absoluteString
                    ])
                } else if let error = exportSession.error {
                    print("[Multitrack] native render failed: \(error.localizedDescription)")
                    call.reject("Multitrack render failed", error.localizedDescription)
                } else {
                    call.reject("Multitrack render failed")
                }
            }
        }
    }

    @objc func shareMediaFile(_ call: CAPPluginCall) {
        guard let fileURL = fileURL(from: call.getString("path")) else {
            call.reject("Missing media file path")
            return
        }

        let title = call.getString("title") ?? fileURL.lastPathComponent
        let audioGain = Float(call.getDouble("audioGain") ?? 1.0)

        amplifiedExportURL(from: fileURL, audioGain: audioGain) { result in
            let shareURL: URL
            switch result {
            case .success(let url):
                shareURL = url
            case .failure(let error):
                print("[NativeExport] share gain export failed: \(error.localizedDescription)")
                shareURL = fileURL
            }

            guard let viewController = self.bridge?.viewController else {
                call.reject("Unable to present share sheet")
                return
            }

            let activityViewController = UIActivityViewController(
                activityItems: [title, shareURL],
                applicationActivities: nil
            )
            activityViewController.popoverPresentationController?.sourceView = viewController.view
            activityViewController.popoverPresentationController?.sourceRect = CGRect(
                x: viewController.view.bounds.midX,
                y: viewController.view.bounds.maxY - 1,
                width: 1,
                height: 1
            )
            activityViewController.completionWithItemsHandler = { _, completed, _, error in
                if let error = error {
                    call.reject("Share failed", error.localizedDescription)
                    return
                }
                call.resolve([
                    "success": true,
                    "completed": completed
                ])
            }

            viewController.present(activityViewController, animated: true)
        }
    }

    @objc func saveVideoToPhotos(_ call: CAPPluginCall) {
        guard let fileURL = fileURL(from: call.getString("path")) else {
            call.reject("Missing video file path")
            return
        }
        let audioGain = Float(call.getDouble("audioGain") ?? 1.0)

        let performSave = { (saveURL: URL) in
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: saveURL)
            }) { success, error in
                DispatchQueue.main.async {
                    if success {
                        call.resolve(["success": true])
                        return
                    }
                    call.reject("Save to Photos failed", error?.localizedDescription)
                }
            }
        }

        let prepareAndSave = {
            self.amplifiedExportURL(from: fileURL, audioGain: audioGain) { result in
                switch result {
                case .success(let saveURL):
                    performSave(saveURL)
                case .failure(let error):
                    print("[NativeExport] photos gain export failed: \(error.localizedDescription)")
                    performSave(fileURL)
                }
            }
        }

        if #available(iOS 14, *) {
            let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
            switch status {
            case .authorized, .limited:
                prepareAndSave()
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization(for: .addOnly) { nextStatus in
                    if nextStatus == .authorized || nextStatus == .limited {
                        prepareAndSave()
                    } else {
                        call.reject("Photos permission denied")
                    }
                }
            default:
                call.reject("Photos permission denied")
            }
        } else {
            let status = PHPhotoLibrary.authorizationStatus()
            switch status {
            case .authorized:
                prepareAndSave()
            case .notDetermined:
                PHPhotoLibrary.requestAuthorization { nextStatus in
                    if nextStatus == .authorized {
                        prepareAndSave()
                    } else {
                        call.reject("Photos permission denied")
                    }
                }
            default:
                call.reject("Photos permission denied")
            }
        }
    }

    @objc func setNativeExperimentalAudioMode(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        let selectedAudioEngine = call.getString("selectedAudioEngine") ?? (enabled ? "Native Experimental" : "Standard")
        let micInputPreference = AudioRouteConfigurator.parseMicInputPreference(call.getString("micInputPreference"))
        let recordingActive = call.getBool("recordingActive") ?? CameraSessionGuard.recordingActive
        let playbackActive = call.getBool("playbackActive") ?? CameraSessionGuard.playbackRouteActive

        do {
            let result = try AudioRouteConfigurator.applyNativeExperimentalAudioMode(
                enabled: enabled,
                selectedAudioEngine: selectedAudioEngine,
                micInputPreference: micInputPreference,
                recordingActive: recordingActive,
                playbackActive: playbackActive
            )
            call.resolve(result)
        } catch {
            var snapshot = AudioRouteConfigurator.routeSnapshot()
            snapshot["success"] = false
            snapshot["enabled"] = enabled
            snapshot["selectedAudioEngine"] = selectedAudioEngine
            snapshot["selectedMicPreference"] = micInputPreference.rawValue
            snapshot["recordingActive"] = recordingActive
            snapshot["playbackActive"] = playbackActive
            snapshot["fallbackReason"] = error.localizedDescription
            print("[NativeExperimentalAudio] failed: \(error.localizedDescription)")
            call.resolve(snapshot)
        }
    }

    @objc func startNativeCameraBridge(_ call: CAPPluginCall) {
        let useFrontCamera = call.getBool("useFrontCamera") ?? true
        let profile = NativeCameraAudioSessionProfile.parse(call.getString("audioSessionProfile"))
        let micPreference = AudioRouteConfigurator.parseMicInputPreference(call.getString("micInputPreference"))

        nativeCameraEngine.startBridgePreview(
            useFrontCamera: useFrontCamera,
            audioSessionProfile: profile,
            micInputPreference: micPreference,
            completion: { result in
                switch result {
                case .success(let payload):
                    call.resolve(payload)
                case .failure(let error):
                    call.reject("Native camera bridge failed", nil, error)
                }
            }
        )
    }

    @objc func stopNativeCameraBridge(_ call: CAPPluginCall) {
        nativeCameraEngine.stopBridgePreview()
        call.resolve()
    }

    @objc func startNativeCameraPreview(_ call: CAPPluginCall) {
        let useFrontCamera = call.getBool("useFrontCamera") ?? true
        let profile = NativeCameraAudioSessionProfile.parse(call.getString("audioSessionProfile"))
        let micPreference = AudioRouteConfigurator.parseMicInputPreference(call.getString("micInputPreference"))

        DispatchQueue.main.async {
            guard let viewController = self.bridge?.viewController else {
                call.reject("Native preview container unavailable")
                return
            }

            guard let container = (viewController as? PortraitBridgeViewController)?.nativeCameraPreviewContainer
                ?? viewController.view else {
                call.reject("Native preview container unavailable")
                return
            }

            self.nativeCameraEngine.startPreview(
                in: container,
                useFrontCamera: useFrontCamera,
                audioSessionProfile: profile,
                micInputPreference: micPreference,
                completion: { result in
                    switch result {
                    case .success(let payload):
                        (self.bridge?.viewController as? PortraitBridgeViewController)?.setCameraPassthrough(true)
                        call.resolve(payload)
                    case .failure(let error):
                        (self.bridge?.viewController as? PortraitBridgeViewController)?.setCameraPassthrough(false)
                        call.reject("Native camera preview failed", nil, error)
                    }
                }
            )
        }
    }

    @objc func stopNativeCameraPreview(_ call: CAPPluginCall) {
        nativeCameraEngine.stopPreview()
        DispatchQueue.main.async {
            (self.bridge?.viewController as? PortraitBridgeViewController)?.setCameraPassthrough(false)
        }
        call.resolve()
    }

    @objc func setNativeCameraPassthrough(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        DispatchQueue.main.async {
            (self.bridge?.viewController as? PortraitBridgeViewController)?.setCameraPassthrough(enabled)
            call.resolve()
        }
    }

    @objc func setNativeCameraFrameBridgeEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        nativeCameraEngine.setFrameBridgeExternallyRequested(enabled)
        call.resolve()
    }

    @objc func setNativeCameraPreviewZoom(_ call: CAPPluginCall) {
        let zoom = call.getDouble("zoom") ?? 1
        nativeCameraEngine.setPreviewZoom(CGFloat(zoom))
        call.resolve()
    }

    @objc func setNativeAudioTapEnabled(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? false
        nativeCameraEngine.setAudioTapEnabled(enabled)
        call.resolve()
    }

    @objc func enhanceTakeAudio(_ call: CAPPluginCall) {
        guard let fileURL = resolvePluginFileURL(from: call) else { return }
        guard let paramsDict = call.getObject("params"),
              let params = AudioEnhancerParams.parse(paramsDict) else {
            call.reject("Invalid enhancer params")
            return
        }
        let isVideo = (call.getString("mediaType") ?? "video") == "video"

        AudioEnhancerRenderer.enhanceInPlace(
            fileURL: fileURL,
            isVideo: isVideo,
            params: params
        ) { result in
            switch result {
            case .success(let payload):
                call.resolve(payload)
            case .failure(let error):
                call.reject("Audio enhancement failed", nil, error)
            }
        }
    }

    @objc func prepareCameraLikePlaybackSession(_ call: CAPPluginCall) {
        let allowWithActivePreview = call.getBool("allowWithActivePreview") ?? false
        do {
            let result = try NativeCameraTestAudio.prepareCameraLikePlaybackSession(
                allowWithActivePreview: allowWithActivePreview
            )
            call.resolve(result)
        } catch {
            call.reject("Failed to prepare camera-like playback session", nil, error)
        }
    }

    private func resolvePluginFileURL(from call: CAPPluginCall) -> URL? {
        guard let urlString = call.getString("url"), !urlString.isEmpty else {
            call.reject("url required")
            return nil
        }

        if urlString.hasPrefix("file://") {
            guard let parsed = URL(string: urlString) else {
                call.reject("invalid file url")
                return nil
            }
            return parsed
        }

        return URL(fileURLWithPath: urlString)
    }

    private func startNativeAVPlayerPlayback(
        fileURL: URL,
        call: CAPPluginCall,
        logLabel: String,
        postProcess: Bool = false
    ) {
        if !CameraSessionGuard.playbackSessionPrepared {
            guard applyCameraLikePlaybackSessionOrReject(call) else { return }
        }

        let session = AVAudioSession.sharedInstance()
        let item = AVPlayerItem(url: fileURL)
        let player = AVPlayer(playerItem: item)
        player.volume = 1.0

        let routeSnapshot = AudioRouteConfigurator.routeSnapshot(for: session)
        let route = routeSnapshot["outputPort"] as? String ?? "unknown"
        let systemVolume = session.outputVolume
        let durationSeconds = CMTimeGetSeconds(item.asset.duration)
        let safeDuration = durationSeconds.isFinite && durationSeconds > 0 ? durationSeconds : 0

        print("[\(logLabel)] started")
        print("[PlaybackRoute] playback started")
        print("[\(logLabel)] fileURL = \(fileURL.absoluteString)")
        print("[\(logLabel)] duration = \(safeDuration)")
        print("[\(logLabel)] route = \(route)")
        print("[\(logLabel)] systemVolume = \(systemVolume)")
        print("[\(logLabel)] playerVolume = \(player.volume)")

        playbackRouteRestorePending = true
        nativeTestPlayer = player
        nativeTestEndObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            print("[\(logLabel)] finished")
            self.stopNativePlaybackTestPlayer()
            self.finishPlaybackRouteIfNeeded()
        }

        player.play()

        var payload: [String: Any] = [
            "fileURL": fileURL.absoluteString,
            "duration": safeDuration,
            "route": route,
            "systemVolume": systemVolume,
            "playerVolume": player.volume,
        ]
        if postProcess {
            payload["postProcess"] = true
        }
        call.resolve(payload)
    }

    @objc func startNativePlaybackTest(_ call: CAPPluginCall) {
        guard let fileURL = resolvePluginFileURL(from: call) else { return }
        stopNativePlaybackTestPlayer()
        startNativeAVPlayerPlayback(fileURL: fileURL, call: call, logLabel: "NativePlaybackTest")
    }

    @objc func stopNativePlaybackTest(_ call: CAPPluginCall) {
        let wasPlaying = nativeTestPlayer != nil
        stopNativePlaybackTestPlayer()
        if wasPlaying {
            finishPlaybackRouteIfNeeded()
            print("[NativePlaybackTest] stopped")
        }
        call.resolve()
    }

    // MARK: - BestTakeBox inline preview (AVPlayer overlay — bypasses WKWebView video decode)

    private func inlineTakeBoxFrame(from call: CAPPluginCall) -> CGRect? {
        guard let x = call.getDouble("x"),
              let y = call.getDouble("y"),
              let width = call.getDouble("width"),
              let height = call.getDouble("height"),
              width > 0,
              height > 0 else {
            return nil
        }
        return CGRect(x: x, y: y, width: width, height: height)
    }

    @objc func startInlineTakeBoxPlayback(_ call: CAPPluginCall) {
        guard let fileURL = resolvePluginFileURL(from: call) else { return }
        guard let frame = inlineTakeBoxFrame(from: call) else {
            call.reject("layout x/y/width/height required")
            return
        }

        let mirror = call.getBool("mirror") ?? false
        let volume = Float(call.getFloat("volume") ?? 1)

        do {
            let payload = try InlineTakeBoxPlaybackController.shared.start(
                plugin: self,
                fileURL: fileURL,
                frameInWindow: frame,
                mirror: mirror,
                volume: volume
            )
            call.resolve(payload)
        } catch {
            call.reject("Failed to start inline take box playback", nil, error)
        }
    }

    @objc func stopInlineTakeBoxPlayback(_ call: CAPPluginCall) {
        let notify = call.getBool("notify") ?? true
        InlineTakeBoxPlaybackController.shared.stop(notify: notify)
        call.resolve()
    }

    @objc func updateInlineTakeBoxPlaybackLayout(_ call: CAPPluginCall) {
        guard let frame = inlineTakeBoxFrame(from: call) else {
            call.reject("layout x/y/width/height required")
            return
        }
        InlineTakeBoxPlaybackController.shared.updateLayout(plugin: self, frameInWindow: frame)
        call.resolve()
    }

    @objc func setInlineTakeBoxPlaybackVolume(_ call: CAPPluginCall) {
        let volume = Float(call.getFloat("volume") ?? 1)
        InlineTakeBoxPlaybackController.shared.setVolume(volume)
        call.resolve()
    }

    // MARK: - Native camera recording A/B test (AVCaptureSession — bypasses WKWebView)

    @objc func startNativeCameraRecording(_ call: CAPPluginCall) {
        let useFrontCamera = call.getBool("useFrontCamera") ?? true
        let profile = NativeCameraAudioSessionProfile.parse(call.getString("audioSessionProfile"))
        let micPreference = AudioRouteConfigurator.parseMicInputPreference(call.getString("micInputPreference"))

        nativeCameraEngine.start(
            useFrontCamera: useFrontCamera,
            audioSessionProfile: profile,
            micInputPreference: micPreference,
            completion: { result in
                switch result {
                case .success(let payload):
                    call.resolve(payload)
                case .failure(let error):
                    call.reject("Native camera recording failed", nil, error)
                }
            }
        )
    }

    @objc func stopNativeCameraRecording(_ call: CAPPluginCall) {
        nativeCameraEngine.stop(completion: { result in
            switch result {
            case .success(let payload):
                call.resolve(payload)
            case .failure(let error):
                call.reject("Native camera stop failed", nil, error)
            }
        })
    }

    @objc func playNativeCameraTestPostProcess(_ call: CAPPluginCall) {
        guard let fileURL = resolvePluginFileURL(from: call) else { return }

        print("[NativeCameraTest] playNativeCameraTestPostProcess")
        print("[NativeCameraTest] fileURL = \(fileURL.absoluteString)")

        stopNativePlaybackTestPlayer()
        startNativeAVPlayerPlayback(
            fileURL: fileURL,
            call: call,
            logLabel: "NativeCameraTest",
            postProcess: true
        )
    }

    @objc func stopNativeCameraTestPostProcess(_ call: CAPPluginCall) {
        let wasPlaying = nativeTestPlayer != nil
        stopNativePlaybackTestPlayer()
        if wasPlaying {
            finishPlaybackRouteIfNeeded()
            print("[NativeCameraTest] post-process playback stopped")
        }
        call.resolve()
    }
}
