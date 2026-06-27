import AVFoundation

enum AudioRouteConfigurator {
    static let highQualityDefaultsKey = "SessionMirror.useIphoneMicForRecording"
    static let headphonePlaybackModeDefaultsKey = "SessionMirror.bluetoothHeadphonePlaybackMode"
    static let nativeExperimentalDefaultsKey = "SessionMirror.nativeExperimentalAudio"

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
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothHFP, .defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            try session.setPreferredInput(nil)
        }

        UserDefaults.standard.set(enableHQ, forKey: highQualityDefaultsKey)
        logRoute(enableHQ ? "HQ route applied" : "default route applied")
    }

    /// Gentle input-only switch used by the "use device mic" setting. Selects the
    /// built-in mic (or restores the system default) WITHOUT changing the session
    /// category or calling setActive, so the live camera capture session is never
    /// interrupted (no zoom/FOV change) and Bluetooth A2DP playback stays intact.
    static func setPreferredBuiltInMic(_ enabled: Bool) throws {
        if CameraSessionGuard.shouldBlockDeviceMicChanges() {
            CameraSessionGuard.skipDeviceMicLog()
            return
        }

        let session = AVAudioSession.sharedInstance()
        UserDefaults.standard.set(enabled, forKey: highQualityDefaultsKey)

        if enabled {
            let availableInputs = session.availableInputs ?? []
            if let builtInMic = availableInputs.first(where: { $0.portType == .builtInMic }) {
                try session.setPreferredInput(builtInMic)
                logRoute("device mic ON (preferred input -> built-in mic)")
            } else {
                logRoute("device mic ON (built-in mic unavailable — left unchanged)")
            }
        } else {
            try session.setPreferredInput(nil)
            logRoute("device mic OFF (preferred input -> system default)")
        }
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
        try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothA2DP, .defaultToSpeaker])
        try session.setActive(true, options: .notifyOthersOnDeactivation)

        let availableInputs = session.availableInputs ?? []
        if let builtInMic = availableInputs.first(where: { $0.portType == .builtInMic }) {
            try session.setPreferredInput(builtInMic)
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
                let options: AVAudioSession.CategoryOptions = [
                    .mixWithOthers,
                    .allowBluetoothA2DP,
                    .allowAirPlay,
                    .defaultToSpeaker,
                ]
                try session.setCategory(.playAndRecord, mode: .videoRecording, options: options)
                try session.setActive(true, options: [])

                let availableInputs = session.availableInputs ?? []
                if let builtInMic = availableInputs.first(where: { $0.portType == .builtInMic }) {
                    try session.setPreferredInput(builtInMic)
                } else {
                    fallbackReason = "built-in mic unavailable; kept system-selected input"
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
        snapshot["recordingActive"] = recordingActive
        snapshot["playbackActive"] = playbackActive
        if let fallbackReason = fallbackReason {
            snapshot["fallbackReason"] = fallbackReason
        }

        print(
            "[NativeExperimentalAudio] selected=\(selectedAudioEngine) enabled=\(enabled) " +
            "category=\(snapshot["category"] ?? "unknown") mode=\(snapshot["mode"] ?? "unknown") " +
            "options=\(snapshot["options"] ?? []) input=\(snapshot["currentInputRoute"] ?? "unknown") " +
            "output=\(snapshot["currentOutputRoute"] ?? "unknown") availableInputs=\(snapshot["availableInputs"] ?? []) " +
            "recordingActive=\(recordingActive) playbackActive=\(playbackActive) " +
            "fallback=\(fallbackReason ?? "none")"
        )

        return snapshot
    }

    static func maintainHighQualityInputIfNeeded() {
        // Deferred to JS at explicit safe times — setPreferredInput here interrupts camera/getUserMedia.
        logRoute("route-change event (maintenance deferred)")
    }
}
