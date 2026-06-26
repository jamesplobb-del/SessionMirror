import AVFoundation

enum AudioRouteConfigurator {
    static let highQualityDefaultsKey = "SessionMirror.useIphoneMicForRecording"
    static let headphonePlaybackModeDefaultsKey = "SessionMirror.bluetoothHeadphonePlaybackMode"

    static func isHighQualityModeEnabled() -> Bool {
        UserDefaults.standard.bool(forKey: highQualityDefaultsKey)
    }

    static func isHeadphonePlaybackModeEnabled() -> Bool {
        UserDefaults.standard.bool(forKey: headphonePlaybackModeDefaultsKey)
    }

    static func shouldUseHighQualityRoute() -> Bool {
        isHighQualityModeEnabled() || isHeadphonePlaybackModeEnabled()
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

        return [
            "inputPort": inputPort,
            "outputPort": outputPort,
            "usesBuiltInMic": usesBuiltInMic,
            "usesBluetoothOutput": usesBluetoothOutput,
            "usesA2DPOutput": usesA2DPOutput,
            "availableInputPorts": availableInputPorts,
            "splitRouteAchieved": splitRouteAchieved,
        ]
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
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .defaultToSpeaker])
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

    static func maintainHighQualityInputIfNeeded() {
        // Deferred to JS at explicit safe times — setPreferredInput here interrupts camera/getUserMedia.
        logRoute("route-change event (maintenance deferred)")
    }
}
