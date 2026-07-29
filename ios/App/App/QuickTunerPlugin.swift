import AVFoundation
import Capacitor
import UIKit

@objc(QuickTunerPlugin)
public class QuickTunerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "QuickTunerPlugin"
    public let jsName = "QuickTunerPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "markWebReady", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingLaunch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getMicrophonePermissionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestMicrophonePermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    ]

    private var launchObserver: NSObjectProtocol?

    override public func load() {
        super.load()
        launchObserver = NotificationCenter.default.addObserver(
            forName: .quickTunerLaunchAvailable,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            print("[QuickTuner] notifying WebView that a launch is available")
            self?.notifyListeners("quickTunerLaunchAvailable", data: [:])
        }
        print("[QuickTuner] Capacitor plugin loaded")
    }

    deinit {
        if let launchObserver {
            NotificationCenter.default.removeObserver(launchObserver)
        }
    }

    @objc func markWebReady(_ call: CAPPluginCall) {
        print("[QuickTuner] WebView marked ready")
        resolvePendingLaunch(call)
    }

    @objc func consumePendingLaunch(_ call: CAPPluginCall) {
        resolvePendingLaunch(call)
    }

    @objc func getMicrophonePermissionStatus(_ call: CAPPluginCall) {
        call.resolve(["status": microphonePermissionStatus()])
    }

    @objc func requestMicrophonePermission(_ call: CAPPluginCall) {
        let resolve: (Bool) -> Void = { granted in
            DispatchQueue.main.async {
                let status = granted ? "granted" : "denied"
                print("[QuickTuner] microphone permission result=\(status)")
                call.resolve(["status": status])
            }
        }

        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission(completionHandler: resolve)
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission(resolve)
        }
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString),
                  UIApplication.shared.canOpenURL(url) else {
                call.reject("App Settings are unavailable")
                return
            }

            UIApplication.shared.open(url, options: [:]) { opened in
                opened ? call.resolve() : call.reject("Could not open App Settings")
            }
        }
    }

    private func resolvePendingLaunch(_ call: CAPPluginCall) {
        if let request = QuickTunerLaunchCoordinator.shared.consumePendingLaunch() {
            call.resolve(["request": request.bridgePayload])
        } else {
            call.resolve([:])
        }
    }

    private func microphonePermissionStatus() -> String {
        if #available(iOS 17.0, *) {
            switch AVAudioApplication.shared.recordPermission {
            case .granted:
                return "granted"
            case .denied:
                return "denied"
            case .undetermined:
                return "notDetermined"
            @unknown default:
                return "unavailable"
            }
        }

        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted:
            return "granted"
        case .denied:
            return "denied"
        case .undetermined:
            return "notDetermined"
        @unknown default:
            return "unavailable"
        }
    }
}
