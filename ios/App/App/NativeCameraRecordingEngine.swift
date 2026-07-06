import AVFoundation
import CoreMedia
import Foundation
import UIKit

/// Debug-only AVCaptureSession recorder — bypasses WKWebView getUserMedia.
final class NativeCameraRecordingEngine: NSObject, AVCaptureFileOutputRecordingDelegate, AVCaptureVideoDataOutputSampleBufferDelegate {
    static let shared = NativeCameraRecordingEngine()

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "SessionMirror.NativeCameraRecording")
    private let frameBridgeQueue = DispatchQueue(label: "SessionMirror.NativeCameraFrameBridge")
    private let frameEncodeQueue = DispatchQueue(label: "SessionMirror.NativeCameraFrameEncode", qos: .userInitiated)
    private var movieOutput: AVCaptureMovieFileOutput?
    private var videoDataOutput: AVCaptureVideoDataOutput?
    private var isSessionConfigured = false
    private var isRecording = false
    private var isStarting = false
    private var isFrameBridgeActive = false
    private var lastBridgeFrameTime: CFTimeInterval = 0
    private var pendingBridgeSample: CMSampleBuffer?
    private var isBridgeEncoding = false
    private let bridgeFramesPerSecond: Double = 60
    private let bridgeMaxPixelDimension: CGFloat = 1080
    private let bridgeJpegQuality: CGFloat = 0.75
    private lazy var ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private lazy var bridgeColorSpace = CGColorSpaceCreateDeviceRGB()
    private var outputURL: URL?
    private var startCompletion: ((Result<[String: Any], Error>) -> Void)?
    private var pendingStartResult: [String: Any]?
    private var stopCompletion: ((Result<[String: Any], Error>) -> Void)?
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

    private override init() {
        super.init()
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
        try profile.apply(to: AVAudioSession.sharedInstance())
        _ = try AudioRouteConfigurator.applyMicInputPreference(micInputPreference)
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
                        if !self.isSessionConfigured || self.movieOutput == nil || self.previewUsesFrontCamera != useFrontCamera {
                            let configuredOutput = try self.configureCaptureSession(useFrontCamera: useFrontCamera)
                            self.movieOutput = configuredOutput
                            self.isSessionConfigured = true
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
                        if !self.isSessionConfigured {
                            self.movieOutput = try self.configureCaptureSession(useFrontCamera: useFrontCamera)
                            self.isSessionConfigured = true
                        }
                        self.previewUsesFrontCamera = useFrontCamera
                        if !self.session.isRunning {
                            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startPreview startRunning.begin")
                            self.session.startRunning()
                            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startPreview startRunning.end")
                        }
                        self.resetVideoZoomIfNeeded(useFrontCamera: useFrontCamera)
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
        isBridgePreviewActive = false
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
        previewLayer?.frame = container.bounds
    }

    private func applyFrontCameraMirroring(to connection: AVCaptureConnection) {
        guard connection.isVideoMirroringSupported else { return }
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = true
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

        guard let audioDevice = AVCaptureDevice.default(for: .audio) else {
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

        if let connection = videoDataOutput.connection(with: .video) {
            if connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
            if connection.isVideoMirroringSupported {
                connection.automaticallyAdjustsVideoMirroring = false
                connection.isVideoMirrored = false
            }
        }

        return movieOutput
    }

    func enableFrameBridge() {
        frameBridgeQueue.async {
            self.isFrameBridgeActive = true
            self.lastBridgeFrameTime = 0
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

        if !(isPreviewActive && session.isRunning && isSessionConfigured) {
            try configureAudioSessionForRecording(
                profile: audioSessionProfile,
                micInputPreference: micInputPreference
            )
        }

        if !isSessionConfigured || movieOutput == nil || (isPreviewActive && previewUsesFrontCamera != useFrontCamera) {
            let configuredOutput = try configureCaptureSession(useFrontCamera: useFrontCamera)
            movieOutput = configuredOutput
            isSessionConfigured = true
            previewUsesFrontCamera = useFrontCamera
        }

        if !session.isRunning {
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startOnSessionQueue startRunning.begin")
            session.startRunning()
            AudioRouteConfigurator.debugCaptureEvent("NativeCameraRecordingEngine.startOnSessionQueue startRunning.end")
        }

        enableFrameBridge()
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
            if self.isBridgePreviewActive {
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
        guard isFrameBridgeActive else { return }
        guard let copiedBuffer = copySampleBuffer(sampleBuffer) else { return }

        pendingBridgeSample = copiedBuffer
        drainBridgeFrames()
    }
}
