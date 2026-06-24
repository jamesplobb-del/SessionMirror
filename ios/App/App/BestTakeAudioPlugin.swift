import AVFoundation
import Capacitor

@objc(BestTakeAudioPlugin)
public class BestTakeAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BestTakeAudioPlugin"
    public let jsName = "BestTakeAudioPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setHighQualityBluetoothMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableStereoPlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableRecordingRoute", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPlaybackOutputProfile", returnType: CAPPluginReturnPromise),
    ]

    private var routeObserver: NSObjectProtocol?

    override public func load() {
        super.load()
        routeObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] _ in
            AudioRouteConfigurator.maintainHighQualityInputIfNeeded()
            AudioRouteConfigurator.logRoute("route-change event")
            guard let self = self else { return }
            self.notifyListeners("audioRouteChanged", data: AudioRouteConfigurator.routeSnapshot())
        }
    }

    deinit {
        if let routeObserver = routeObserver {
            NotificationCenter.default.removeObserver(routeObserver)
        }
    }

    @objc func setHighQualityBluetoothMode(_ call: CAPPluginCall) {
        let enableHQ = call.getBool("enable") ?? false

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

    @objc func enableStereoPlayback(_ call: CAPPluginCall) {
        if AudioRouteConfigurator.isHighQualityModeEnabled() {
            do {
                try AudioRouteConfigurator.applyRecordingRoute(enableHQ: true)
                call.resolve()
            } catch {
                call.reject("Failed to maintain HQ recording route", error.localizedDescription)
            }
            return
        }

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playback,
                mode: .moviePlayback,
                options: [.allowBluetoothA2DP, .allowAirPlay, .mixWithOthers]
            )
            try session.setActive(true, options: [])
            AudioRouteConfigurator.logRoute("stereo playback")
            call.resolve()
        } catch {
            call.reject("Failed to set stereo playback", error.localizedDescription)
        }
    }

    @objc func enableRecordingRoute(_ call: CAPPluginCall) {
        do {
            try AudioRouteConfigurator.applyRecordingRoute(
                enableHQ: AudioRouteConfigurator.isHighQualityModeEnabled()
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
}
