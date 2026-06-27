import AVFoundation
import Foundation
import UIKit

/// Debug-only AVCaptureSession recorder — bypasses WKWebView getUserMedia.
final class NativeCameraRecordingEngine: NSObject, AVCaptureFileOutputRecordingDelegate {
    static let shared = NativeCameraRecordingEngine()

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "SessionMirror.NativeCameraRecording")
    private var movieOutput: AVCaptureMovieFileOutput?
    private var isSessionConfigured = false
    private var isRecording = false
    private var isStarting = false
    private var outputURL: URL?
    private var startCompletion: ((Result<[String: Any], Error>) -> Void)?
    private var pendingStartResult: [String: Any]?
    private var stopCompletion: ((Result<[String: Any], Error>) -> Void)?
    private var recordedVideoWidth: Int = 0
    private var recordedVideoHeight: Int = 0
    private var activeAudioProfile: NativeCameraAudioSessionProfile = .videoRecording
    private weak var previewContainer: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var isPreviewActive = false
    private var previewUsesFrontCamera = true

    private override init() {
        super.init()
    }

    private func takesDirectoryURL() throws -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let takesDir = docs.appendingPathComponent("takes", isDirectory: true)
        try FileManager.default.createDirectory(at: takesDir, withIntermediateDirectories: true)
        return takesDir
    }

    private func configureAudioSessionForRecording(profile: NativeCameraAudioSessionProfile) throws {
        activeAudioProfile = profile
        try profile.apply(to: AVAudioSession.sharedInstance())
        _ = NativeCameraTestAudio.sessionDiagnostics(profile: profile)
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

    func startPreview(
        in container: UIView,
        useFrontCamera: Bool,
        audioSessionProfile: NativeCameraAudioSessionProfile,
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
                        try self.configureAudioSessionForRecording(profile: audioSessionProfile)
                        if !self.isSessionConfigured {
                            self.movieOutput = try self.configureCaptureSession(useFrontCamera: useFrontCamera)
                            self.isSessionConfigured = true
                        }
                        self.previewUsesFrontCamera = useFrontCamera
                        if !self.session.isRunning {
                            self.session.startRunning()
                        }
                        let sessionInfo = NativeCameraTestAudio.sessionDiagnostics(profile: audioSessionProfile)
                        DispatchQueue.main.async {
                            if let container = container {
                                self.attachPreviewLayer(to: container)
                                self.isPreviewActive = true
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
        DispatchQueue.main.async {
            self.previewLayer?.removeFromSuperlayer()
            self.previewLayer = nil
            self.previewContainer = nil
            self.isPreviewActive = false
        }

        sessionQueue.async {
            guard !self.isRecording, self.session.isRunning else { return }
            self.session.stopRunning()
        }
    }

    func layoutPreview(in container: UIView) {
        guard previewContainer === container else { return }
        previewLayer?.frame = container.bounds
    }

    private func applyFrontCameraMirroring(to connection: AVCaptureConnection) {
        guard connection.isVideoMirroringSupported else { return }
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = true
    }

    private func attachPreviewLayer(to container: UIView) {
        previewContainer = container
        let layer = previewLayer ?? AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = container.bounds
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
        previewLayer = layer
    }

    func start(
        useFrontCamera: Bool,
        audioSessionProfile: NativeCameraAudioSessionProfile,
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
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        for input in session.inputs {
            session.removeInput(input)
        }
        for output in session.outputs {
            session.removeOutput(output)
        }

        movieOutput = nil
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
        videoDevice.unlockForConfiguration()

        let videoInput = try AVCaptureDeviceInput(device: videoDevice)
        guard session.canAddInput(videoInput) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 5,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add video input"]
            )
        }
        session.addInput(videoInput)

        guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 6,
                userInfo: [NSLocalizedDescriptionKey: "Built-in microphone unavailable"]
            )
        }

        let audioInput = try AVCaptureDeviceInput(device: audioDevice)
        guard session.canAddInput(audioInput) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 7,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add audio input"]
            )
        }
        session.addInput(audioInput)

        let movieOutput = AVCaptureMovieFileOutput()
        guard session.canAddOutput(movieOutput) else {
            throw NSError(
                domain: "NativeCameraTest",
                code: 8,
                userInfo: [NSLocalizedDescriptionKey: "Cannot add movie output"]
            )
        }
        session.addOutput(movieOutput)

        if let connection = movieOutput.connection(with: .video) {
            if cameraPosition == .front {
                applyFrontCameraMirroring(to: connection)
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

        return movieOutput
    }

    private func startOnSessionQueue(
        useFrontCamera: Bool,
        audioSessionProfile: NativeCameraAudioSessionProfile,
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

        if !(isPreviewActive && session.isRunning && isSessionConfigured) {
            try configureAudioSessionForRecording(profile: audioSessionProfile)
        }

        if !isSessionConfigured || movieOutput == nil || (isPreviewActive && previewUsesFrontCamera != useFrontCamera) {
            let configuredOutput = try configureCaptureSession(useFrontCamera: useFrontCamera)
            movieOutput = configuredOutput
            isSessionConfigured = true
            previewUsesFrontCamera = useFrontCamera
        }

        if !session.isRunning {
            session.startRunning()
        }

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

        return result
    }

    func stop(completion: @escaping (Result<[String: Any], Error>) -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }

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

            DispatchQueue.main.async {
                if let result = result {
                    completion?(.success(result))
                }
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
            let startCompletion = self.startCompletion
            self.startCompletion = nil
            self.pendingStartResult = nil

            if self.session.isRunning && !self.isPreviewActive {
                self.session.stopRunning()
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

            do {
                let info = try self.buildStopResult(for: outputFileURL)
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
