import AVFoundation

enum AudioRouteConfigurator {
    static let highQualityDefaultsKey = "SessionMirror.useIphoneMicForRecording"

    static func isHighQualityModeEnabled() -> Bool {
        UserDefaults.standard.bool(forKey: highQualityDefaultsKey)
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
        let session = AVAudioSession.sharedInstance()

        if enableHQ {
            // A2DP output only — omit .allowBluetooth so iOS does not force HFP duplex.
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothA2DP, .defaultToSpeaker])
        } else {
            try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetooth, .defaultToSpeaker])
        }

        try session.setActive(true, options: .notifyOthersOnDeactivation)

        if enableHQ {
            let availableInputs = session.availableInputs ?? []
            if let builtInMic = availableInputs.first(where: { $0.portType == .builtInMic }) {
                try session.setPreferredInput(builtInMic)
            } else {
                print("BestTake Audio: built-in mic not found in availableInputs=\(availableInputs.map { $0.portType.rawValue })")
            }
        } else {
            try session.setPreferredInput(nil)
        }

        UserDefaults.standard.set(enableHQ, forKey: highQualityDefaultsKey)
        logRoute(enableHQ ? "HQ route applied" : "default route applied")
    }

    static func maintainHighQualityInputIfNeeded() {
        guard isHighQualityModeEnabled() else { return }
        let session = AVAudioSession.sharedInstance()
        guard session.category == .playAndRecord else { return }

        do {
            if let builtInMic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
                try session.setPreferredInput(builtInMic)
            }
            logRoute("route-change maintain HQ input")
        } catch {
            print("BestTake Audio: failed to maintain HQ input route: \(error.localizedDescription)")
        }
    }
}
