import AVFoundation

enum AudioRouteConfigurator {
    static let highQualityDefaultsKey = "SessionMirror.useIphoneMicForRecording"
    static let headphonePlaybackModeDefaultsKey = "SessionMirror.bluetoothHeadphonePlaybackMode"
    static let nativeExperimentalDefaultsKey = "SessionMirror.nativeExperimentalAudio"

    enum MicInputPreference: String {
        case auto
        case headphone
        case iphone
    }

    static func isHighQualityModeEnabled() -> Bool {
        UserDefaults.standard.bool(forKey: highQualityDefaultsKey)
    }

    static func isHeadphonePlaybackModeEnabled() -> Bool {
        UserDefaults.standard.bool(forKey: headphonePlaybackModeDefaultsKey)
    }

    static func shouldUseHighQualityRoute() -> Bool {
        isHighQualityModeEnabled() || isHeadphonePlaybackModeEnabled()
    }

    private static func optionNames(_ options: AVAudioSession.CategoryOptions) -> [String] {
        var names: [String] = []
        if options.contains(.mixWithOthers) { names.append("mixWithOthers") }
        if options.contains(.duckOthers) { names.append("duckOthers") }
        if options.contains(.allowBluetoothHFP) { names.append("allowBluetoothHFP") }
        if options.contains(.defaultToSpeaker) { names.append("defaultToSpeaker") }
        if options.contains(.interruptSpokenAudioAndMixWithOthers) { names.append("interruptSpokenAudioAndMixWithOthers") }
        if options.contains(.allowBluetoothA2DP) { names.append("allowBluetoothA2DP") }
        if options.contains(.allowAirPlay) { names.append("allowAirPlay") }
        if #available(iOS 14.5, *), options.contains(.overrideMutedMicrophoneInterruption) {
            names.append("overrideMutedMicrophoneInterruption")
        }
        return names
    }

    static func routeSnapshot(for session: AVAudioSession = .sharedInstance()) -> [String: Any] {
        let inputs = session.currentRoute.inputs
        let outputs = session.currentRoute.outputs
        let inputPort = inputs.first?.portType.rawValue ?? "none"
        let outputPort = outputs.first?.portType.rawValue ?? "none"
        let usesBuiltInMic = inputs.contains { $0.portType == .builtInMic }
        let bluetoothOutputPorts: Set<AVAudioSession.Port> = [
            .bluetoothA2DP,
            .bluetoothHFP,
            .bluetoothLE,
        ]
        let usesBluetoothOutput = outputs.contains { bluetoothOutputPorts.contains($0.portType) }
        let usesA2DPOutput = outputs.contains { $0.portType == .bluetoothA2DP }
        let availableInputPorts = (session.availableInputs ?? []).map { $0.portType.rawValue }
        let splitRouteAchieved = usesBuiltInMic && (usesA2DPOutput || outputPort == AVAudioSession.Port.headphones.rawValue)

        var snapshot: [String: Any] = [
            "inputPort": inputPort,
            "outputPort": outputPort,
            "usesBuiltInMic": usesBuiltInMic,
            "usesBluetoothOutput": usesBluetoothOutput,
            "usesA2DPOutput": usesA2DPOutput,
            "availableInputPorts": availableInputPorts,
            "splitRouteAchieved": splitRouteAchieved,
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "options": optionNames(session.categoryOptions),
            "currentInputRoute": inputPort,
            "currentOutputRoute": outputPort,
            "availableInputs": availableInputPorts,
            "sampleRate": session.sampleRate,
            "ioBufferDuration": session.ioBufferDuration,
            "outputVolume": session.outputVolume,
        ]
        if let preferredInput = session.preferredInput {
            snapshot["preferredInput"] = preferredInput.portType.rawValue
        }
        return snapshot
    }

    private static func compactStack(skipFrames: Int = 2, maxFrames: Int = 8) -> String {
        Thread.callStackSymbols
            .dropFirst(skipFrames)
            .prefix(maxFrames)
            .joined(separator: " | ")
    }

    private static func routeSummary(_ session: AVAudioSession = .sharedInstance()) -> String {
        let snapshot = routeSnapshot(for: session)
        return "category=\(snapshot["category"] ?? "unknown") " +
            "mode=\(snapshot["mode"] ?? "unknown") " +
            "options=\(snapshot["options"] ?? []) " +
            "input=\(snapshot["currentInputRoute"] ?? "unknown") " +
            "output=\(snapshot["currentOutputRoute"] ?? "unknown") " +
            "preferredInput=\(snapshot["preferredInput"] ?? "auto") " +
            "availableInputs=\(snapshot["availableInputs"] ?? [])"
    }

    /// Tracks whether WE last activated the shared session. Redundant
    /// setCategory/setActive calls are not free: each one can bounce WebKit
    /// (YouTube iframe / take <video>) audio and stall the camera pipeline.
    private(set) static var appSessionActive = false

    /// Call from the AVAudioSession interruption observer so ensureSessionActive
    /// knows a reactivation is genuinely needed.
    static func noteInterruptionBegan() {
        appSessionActive = false
    }

    static func debugSetCategory(
        _ session: AVAudioSession,
        category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions,
        caller: String
    ) throws {
        if session.category == category && session.mode == mode && session.categoryOptions == options {
            print("[AVAudioSessionTrace] setCategory skipped (already applied) caller=\(caller) category=\(category.rawValue) mode=\(mode.rawValue) options=\(optionNames(options))")
            return
        }
        print("[AVAudioSessionTrace] setCategory caller=\(caller) requestedCategory=\(category.rawValue) requestedMode=\(mode.rawValue) requestedOptions=\(optionNames(options)) before=\(routeSummary(session)) stack=\(compactStack())")
        try session.setCategory(category, mode: mode, options: options)
        print("[AVAudioSessionTrace] setCategory complete caller=\(caller) after=\(routeSummary(session))")
    }

    static func debugSetActive(
        _ session: AVAudioSession,
        active: Bool,
        options: AVAudioSession.SetActiveOptions = [],
        caller: String
    ) throws {
        print("[AVAudioSessionTrace] setActive caller=\(caller) active=\(active) options=\(options.rawValue) before=\(routeSummary(session)) stack=\(compactStack())")
        try session.setActive(active, options: options)
        appSessionActive = active
        print("[AVAudioSessionTrace] setActive complete caller=\(caller) after=\(routeSummary(session))")
    }

    /// Activate only when we have not already activated (or were interrupted /
    /// backgrounded since). Redundant setActive(true) calls interrupt WebKit media.
    static func ensureSessionActive(
        _ session: AVAudioSession,
        caller: String
    ) throws {
        if appSessionActive {
            print("[AVAudioSessionTrace] setActive skipped (already active) caller=\(caller)")
            return
        }
        try debugSetActive(session, active: true, options: [], caller: caller)
    }

    static func debugSetPreferredInput(
        _ session: AVAudioSession,
        input: AVAudioSessionPortDescription?,
        caller: String
    ) throws {
        let requestedInput = input?.portType.rawValue ?? "auto"
        print("[AVAudioSessionTrace] setPreferredInput caller=\(caller) requestedInput=\(requestedInput) before=\(routeSummary(session)) stack=\(compactStack())")
        try session.setPreferredInput(input)
        print("[AVAudioSessionTrace] setPreferredInput complete caller=\(caller) after=\(routeSummary(session))")
    }

    static func debugCaptureEvent(_ label: String, details: String = "") {
        print("[AVCaptureTrace] \(label) \(details) route=\(routeSummary()) stack=\(compactStack())")
    }

    private static func hasExternalOutput(_ session: AVAudioSession) -> Bool {
        let externalOutputPorts: Set<AVAudioSession.Port> = [
            .airPlay,
            .bluetoothA2DP,
            .bluetoothHFP,
            .bluetoothLE,
            .carAudio,
            .headphones,
            .usbAudio,
        ]
        return session.currentRoute.outputs.contains { externalOutputPorts.contains($0.portType) }
    }

    private static func preferBuiltInSpeakerIfSafe(_ session: AVAudioSession) throws {
        guard !hasExternalOutput(session) else { return }
        try session.overrideOutputAudioPort(.speaker)
    }

    static func parseMicInputPreference(_ raw: String?) -> MicInputPreference {
        guard let raw = raw, let preference = MicInputPreference(rawValue: raw) else {
            return .auto
        }
        return preference
    }

    private static func preferredInputPort(
        for preference: MicInputPreference,
        availableInputs: [AVAudioSessionPortDescription]
    ) -> AVAudioSessionPortDescription? {
        switch preference {
        case .auto:
            return nil
        case .iphone:
            return availableInputs.first(where: { $0.portType == .builtInMic })
        case .headphone:
            let headphoneInputPorts: Set<AVAudioSession.Port> = [
                .bluetoothHFP,
                .bluetoothLE,
                .headsetMic,
            ]
            return availableInputs.first(where: { headphoneInputPorts.contains($0.portType) })
        }
    }

    private static func routeUsesBluetoothHFP(_ session: AVAudioSession) -> Bool {
        session.currentRoute.inputs.contains { $0.portType == .bluetoothHFP } ||
            session.currentRoute.outputs.contains { $0.portType == .bluetoothHFP }
    }

    private static func resetSessionAwayFromBluetoothHFPIfNeeded(
        _ session: AVAudioSession,
        mode: AVAudioSession.Mode = .videoRecording
    ) throws {
        guard routeUsesBluetoothHFP(session) || session.categoryOptions.contains(.allowBluetoothHFP) else {
            return
        }

        print("[MicInputPreference] resetting session away from BluetoothHFP before iPhone mic")
        try debugSetPreferredInput(session, input: nil, caller: "resetSessionAwayFromBluetoothHFPIfNeeded.clearPreferredInput")
        try debugSetCategory(
            session,
            category: .playAndRecord,
            mode: mode,
            options: [.mixWithOthers, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker],
            caller: "resetSessionAwayFromBluetoothHFPIfNeeded"
        )
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.0029)
        try debugSetActive(session, active: false, options: .notifyOthersOnDeactivation, caller: "resetSessionAwayFromBluetoothHFPIfNeeded.deactivate")
        try debugSetActive(session, active: true, options: [], caller: "resetSessionAwayFromBluetoothHFPIfNeeded.activate")
    }

    @discardableResult
    static func applyMicInputPreference(
        _ preference: MicInputPreference,
        session: AVAudioSession = .sharedInstance()
    ) throws -> [String: Any] {
        var fallbackReason: String?

        if preference == .auto {
            try debugSetPreferredInput(session, input: nil, caller: "applyMicInputPreference.auto")
        } else {
            if preference == .iphone { try resetSessionAwayFromBluetoothHFPIfNeeded(session) }
            let availableInputs = session.availableInputs ?? []
            if let input = preferredInputPort(for: preference, availableInputs: availableInputs) {
                try debugSetPreferredInput(session, input: input, caller: "applyMicInputPreference.\(preference.rawValue)")
            } else {
                try debugSetPreferredInput(session, input: nil, caller: "applyMicInputPreference.fallbackAuto")
                fallbackReason = "\(preference.rawValue) input unavailable; fell back to Auto"
            }
        }

        var snapshot = routeSnapshot(for: session)
        snapshot["success"] = true
        snapshot["selectedMicPreference"] = preference.rawValue
        if let preferredInput = session.preferredInput {
            snapshot["preferredInputSet"] = preferredInput.portType.rawValue
        } else {
            snapshot["preferredInputSet"] = "auto"
        }
        if let fallbackReason = fallbackReason {
            snapshot["fallbackReason"] = fallbackReason
        }

        print(
            "[MicInputPreference] selected=\(preference.rawValue) " +
            "availableInputs=\(snapshot["availableInputs"] ?? []) " +
            "currentInputs=\(session.currentRoute.inputs.map { $0.portType.rawValue }) " +
            "currentOutputs=\(session.currentRoute.outputs.map { $0.portType.rawValue }) " +
            "preferredInput=\(snapshot["preferredInputSet"] ?? "auto") " +
            "fallback=\(fallbackReason ?? "none")"
        )

        return snapshot
    }

    /// Minimal speaker routing for WKWebView playback while the native camera
    /// capture session stays live. Avoids category/mode changes that would
    /// change camera FOV or stall the JPEG preview pump.
    static func applyCoexistentPlaybackSpeakerRoute() throws -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        try ensureSessionActive(session, caller: "applyCoexistentPlaybackSpeakerRoute")
        try preferBuiltInSpeakerIfSafe(session)

        var snapshot = routeSnapshot(for: session)
        snapshot["success"] = true
        snapshot["routeApplied"] = true
        snapshot["webPlaybackActive"] = true
        snapshot["playbackRouteStyle"] = "coexistent"
        snapshot["recordingActive"] = CameraSessionGuard.recordingActive
        snapshot["cameraPreviewActive"] = CameraSessionGuard.previewActive
        snapshot["playbackRouteActive"] = CameraSessionGuard.playbackRouteActive
        snapshot["nativeLoudnessProfile"] = "coexistent-speaker-override"

        print(
            "[WebPlaybackAudio] routeApplied=true style=coexistent webPlaybackActive=true " +
            "recordingActive=\(CameraSessionGuard.recordingActive) cameraPreviewActive=\(CameraSessionGuard.previewActive) " +
            "category=\(snapshot["category"] ?? "unknown") mode=\(snapshot["mode"] ?? "unknown") " +
            "input=\(snapshot["currentInputRoute"] ?? "unknown") output=\(snapshot["currentOutputRoute"] ?? "unknown")"
        )

        return snapshot
    }

    static func applyWebPlaybackRoute(webPlaybackActive: Bool = true) throws -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        var fallbackReason: String?
        var routeApplied = false

        if CameraSessionGuard.shouldBlockRouteChanges() {
            fallbackReason = "route change blocked while camera preview or recording is active"
            CameraSessionGuard.skipRouteChangeLog()
        } else {
            let outputPort = session.currentRoute.outputs.first?.portType ?? .builtInSpeaker
            let builtInSpeakerOutputs: Set<AVAudioSession.Port> = [.builtInSpeaker, .builtInReceiver]

            if builtInSpeakerOutputs.contains(outputPort) {
                try debugSetCategory(
                    session,
                    category: .playAndRecord,
                    mode: .default,
                    options: [.mixWithOthers, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker],
                    caller: "applyWebPlaybackRoute.builtInSpeaker"
                )
                try session.setPreferredSampleRate(48_000)
                try session.setPreferredIOBufferDuration(0.005)
                try ensureSessionActive(session, caller: "applyWebPlaybackRoute.builtInSpeaker")
                try preferBuiltInSpeakerIfSafe(session)
            } else {
                // Full-volume external playback. Do not use duckOthers; omit mixWithOthers so WebView audio is not softened.
                try debugSetCategory(
                    session,
                    category: .playback,
                    mode: .default,
                    options: [.allowAirPlay],
                    caller: "applyWebPlaybackRoute.externalOutput"
                )
                try session.setPreferredSampleRate(48_000)
                try session.setPreferredIOBufferDuration(0.005)
                try debugSetActive(session, active: true, options: [], caller: "applyWebPlaybackRoute.externalOutput")
            }

            routeApplied = true
        }

        var snapshot = routeSnapshot(for: session)
        snapshot["success"] = true
        snapshot["routeApplied"] = routeApplied
        snapshot["webPlaybackActive"] = webPlaybackActive
        snapshot["playbackRouteStyle"] = routeApplied ? "full" : "unchanged"
        snapshot["recordingActive"] = CameraSessionGuard.recordingActive
        snapshot["cameraPreviewActive"] = CameraSessionGuard.previewActive
        snapshot["playbackRouteActive"] = CameraSessionGuard.playbackRouteActive
        snapshot["nativeLoudnessProfile"] = routeApplied ? "web-playback-full-volume" : "unchanged"
        if let fallbackReason = fallbackReason {
            snapshot["fallbackReason"] = fallbackReason
        }

        print(
            "[WebPlaybackAudio] routeApplied=\(routeApplied) webPlaybackActive=\(webPlaybackActive) " +
            "recordingActive=\(CameraSessionGuard.recordingActive) cameraPreviewActive=\(CameraSessionGuard.previewActive) " +
            "category=\(snapshot["category"] ?? "unknown") mode=\(snapshot["mode"] ?? "unknown") " +
            "options=\(snapshot["options"] ?? []) input=\(snapshot["currentInputRoute"] ?? "unknown") " +
            "output=\(snapshot["currentOutputRoute"] ?? "unknown") fallback=\(fallbackReason ?? "none")"
        )

        return snapshot
    }

    static func logRoute(_ label: String, session: AVAudioSession = .sharedInstance()) {
        let snapshot = routeSnapshot(for: session)
        let inputPort = snapshot["inputPort"] as? String ?? "unknown"
        let outputPort = snapshot["outputPort"] as? String ?? "unknown"
        let builtInMic = snapshot["usesBuiltInMic"] as? Bool ?? false
        let btOut = snapshot["usesBluetoothOutput"] as? Bool ?? false
        let a2dpOut = snapshot["usesA2DPOutput"] as? Bool ?? false
        let available = snapshot["availableInputPorts"] as? [String] ?? []
        let split = snapshot["splitRouteAchieved"] as? Bool ?? false
        print(
            "BestTake Audio [\(label)] input=\(inputPort) output=\(outputPort) " +
            "builtInMic=\(builtInMic) btOut=\(btOut) a2dpOut=\(a2dpOut) " +
            "splitRoute=\(split) availableInputs=\(available)"
        )
    }

    static func applyRecordingRoute(enableHQ: Bool) throws {
        if CameraSessionGuard.shouldBlockRouteChanges() {
            CameraSessionGuard.skipRouteChangeLog()
            return
        }

        let session = AVAudioSession.sharedInstance()

        if enableHQ {
            try configureHighQualitySession()
        } else {
            try debugSetCategory(session, category: .playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker], caller: "applyRecordingRoute.default")
            try ensureSessionActive(session, caller: "applyRecordingRoute.default")
            try debugSetPreferredInput(session, input: nil, caller: "applyRecordingRoute.default")
        }

        UserDefaults.standard.set(enableHQ, forKey: highQualityDefaultsKey)
        logRoute(enableHQ ? "HQ route applied" : "default route applied")
    }

    /// Gentle input-only switch used by the "use device mic" setting. Selects the
    /// built-in mic (or restores the system default) WITHOUT changing the session
    /// category or calling setActive, so the live camera capture session is never
    /// interrupted (no zoom/FOV change) and Bluetooth A2DP playback stays intact.
    static func setPreferredBuiltInMic(_ enabled: Bool) throws {
        _ = try setMicInputPreference(enabled ? .iphone : .auto)
    }

    static func setMicInputPreference(_ preference: MicInputPreference) throws -> [String: Any] {
        if CameraSessionGuard.shouldBlockDeviceMicChanges() {
            CameraSessionGuard.skipDeviceMicLog()
            var snapshot = routeSnapshot()
            snapshot["success"] = true
            snapshot["selectedMicPreference"] = preference.rawValue
            snapshot["queued"] = true
            print("[MicInputPreference] queued selected=\(preference.rawValue) reason=input preference blocked during preview/playback overlap")
            return snapshot
        }

        let session = AVAudioSession.sharedInstance()
        UserDefaults.standard.set(preference == .iphone, forKey: highQualityDefaultsKey)
        return try applyMicInputPreference(preference, session: session)
    }

    static func applyHeadphonePlaybackRoute() throws {
        if CameraSessionGuard.shouldBlockRouteChanges() {
            CameraSessionGuard.skipRouteChangeLog()
            return
        }

        try configureHighQualitySession()
        logRoute("headphone playback route applied")
    }

    private static func configureHighQualitySession() throws {
        if CameraSessionGuard.shouldBlockRouteChanges() {
            CameraSessionGuard.skipRouteChangeLog()
            return
        }

        let session = AVAudioSession.sharedInstance()
        // A2DP output only — omit .allowBluetooth so iOS does not force HFP duplex.
        try debugSetCategory(session, category: .playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker], caller: "configureHighQualitySession")
        try ensureSessionActive(session, caller: "configureHighQualitySession")

        let availableInputs = session.availableInputs ?? []
        if let builtInMic = availableInputs.first(where: { $0.portType == .builtInMic }) {
            try debugSetPreferredInput(session, input: builtInMic, caller: "configureHighQualitySession")
        } else {
            print("BestTake Audio: built-in mic not found in availableInputs=\(availableInputs.map { $0.portType.rawValue })")
        }
    }

    static func setHeadphonePlaybackMode(_ enabled: Bool, applyRoute: Bool = false) throws {
        UserDefaults.standard.set(enabled, forKey: headphonePlaybackModeDefaultsKey)
        guard applyRoute else {
            logRoute(enabled ? "headphone playback mode flag ON" : "headphone playback mode flag OFF")
            return
        }
        if enabled {
            if CameraSessionGuard.shouldBlockRouteChanges() {
                CameraSessionGuard.skipRouteChangeLog()
                return
            }
            try applyHeadphonePlaybackRoute()
        } else if !isHighQualityModeEnabled() {
            try applyRecordingRoute(enableHQ: false)
        } else {
            logRoute("headphone playback mode OFF (HQ mic route retained)")
        }
    }

    static func applyNativeExperimentalAudioMode(
        enabled: Bool,
        selectedAudioEngine: String,
        micInputPreference: MicInputPreference,
        recordingActive: Bool,
        playbackActive: Bool
    ) throws -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        UserDefaults.standard.set(enabled, forKey: nativeExperimentalDefaultsKey)

        var fallbackReason: String?

        if enabled {
            if CameraSessionGuard.shouldBlockRouteChanges() {
                fallbackReason = "route change blocked while camera preview or recording is active"
                CameraSessionGuard.skipRouteChangeLog()
            } else {
                let playbackFocused = playbackActive && !recordingActive
                // Every branch stays mixable — dropping mixWithOthers here made
                // playback-state flips interrupt WebKit media (YouTube pausing).
                let options: AVAudioSession.CategoryOptions = playbackFocused
                    ? [.mixWithOthers, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker]
                    : micInputPreference == .headphone
                        ? [.mixWithOthers, .allowBluetoothHFP, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker]
                        : [.mixWithOthers, .allowBluetoothA2DP, .allowAirPlay, .defaultToSpeaker]
                let mode: AVAudioSession.Mode = playbackFocused ? .default : .videoRecording

                try debugSetCategory(session, category: .playAndRecord, mode: mode, options: options, caller: "applyNativeExperimentalAudioMode")
                try session.setPreferredSampleRate(48_000)
                try session.setPreferredIOBufferDuration(playbackFocused ? 0.005 : 0.0029)
                try ensureSessionActive(session, caller: "applyNativeExperimentalAudioMode")

                if playbackFocused {
                    fallbackReason = micInputPreference == .iphone
                        ? "mic preference deferred during playback"
                        : nil
                } else {
                    let micSnapshot = try applyMicInputPreference(micInputPreference, session: session)
                    fallbackReason = micSnapshot["fallbackReason"] as? String
                }

                if playbackFocused {
                    do {
                        try preferBuiltInSpeakerIfSafe(session)
                    } catch {
                        let speakerFallback = "speaker override failed: \(error.localizedDescription)"
                        fallbackReason = fallbackReason.map { "\($0); \(speakerFallback)" } ?? speakerFallback
                    }
                }
            }
        } else {
            if CameraSessionGuard.shouldBlockRouteChanges() {
                fallbackReason = "restore blocked while camera preview or recording is active"
                CameraSessionGuard.skipRouteChangeLog()
            } else {
                try applyRecordingRoute(enableHQ: shouldUseHighQualityRoute())
            }
        }

        var snapshot = routeSnapshot(for: session)
        snapshot["success"] = true
        snapshot["enabled"] = enabled
        snapshot["selectedAudioEngine"] = selectedAudioEngine
        snapshot["selectedMicPreference"] = micInputPreference.rawValue
        snapshot["recordingActive"] = recordingActive
        snapshot["playbackActive"] = playbackActive
        snapshot["nativeLoudnessProfile"] = playbackActive && !recordingActive ? "speaker-playback" : "camera-input"
        if let fallbackReason = fallbackReason {
            snapshot["fallbackReason"] = fallbackReason
        }

        print(
            "[NativeExperimentalAudio] selected=\(selectedAudioEngine) enabled=\(enabled) " +
            "category=\(snapshot["category"] ?? "unknown") mode=\(snapshot["mode"] ?? "unknown") " +
            "options=\(snapshot["options"] ?? []) input=\(snapshot["currentInputRoute"] ?? "unknown") " +
            "output=\(snapshot["currentOutputRoute"] ?? "unknown") availableInputs=\(snapshot["availableInputs"] ?? []) " +
            "nativeLoudnessProfile=\(snapshot["nativeLoudnessProfile"] ?? "unknown") " +
            "micPreference=\(micInputPreference.rawValue) preferredInput=\(snapshot["preferredInput"] ?? "auto") " +
            "recordingActive=\(recordingActive) playbackActive=\(playbackActive) " +
            "fallback=\(fallbackReason ?? "none")"
        )

        return snapshot
    }

    static func deactivateCaptureSessionIfIdle() throws {
        guard !CameraSessionGuard.isCameraOrRecordingActive else { return }
        guard !CameraSessionGuard.playbackRouteActive else { return }
        guard !CameraSessionGuard.isWithinForegroundGracePeriod else {
            print("[AudioRoute] skipped idle deactivation — within foreground grace period (ownership handshake still settling)")
            return
        }

        let session = AVAudioSession.sharedInstance()
        try debugSetActive(
            session,
            active: false,
            options: .notifyOthersOnDeactivation,
            caller: "deactivateCaptureSessionIfIdle"
        )
        logRoute("capture session deactivated while app backgrounded")
    }

    static func suspendForAppBackground() {
        CameraSessionGuard.setPreviewActive(false)
        CameraSessionGuard.setRecordingActive(false)
        CameraSessionGuard.setPlaybackRouteActive(false)

        let session = AVAudioSession.sharedInstance()
        do {
            try debugSetPreferredInput(session, input: nil, caller: "suspendForAppBackground.clearPreferredInput")
            try debugSetActive(
                session,
                active: false,
                options: .notifyOthersOnDeactivation,
                caller: "suspendForAppBackground"
            )
            logRoute("audio session suspended for app background")
        } catch {
            print("[AudioRoute] failed to suspend audio session for background: \(error.localizedDescription)")
        }
    }

    static func maintainHighQualityInputIfNeeded() {
        // Deferred to JS at explicit safe times — setPreferredInput here interrupts camera/getUserMedia.
        logRoute("route-change event (maintenance deferred)")
    }
}
