import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var audioRouteObserver: NSObjectProtocol?
    private var audioInterruptionObserver: NSObjectProtocol?

    /// Keep the Swift plugin class linked so Capacitor packageClassList can resolve it.
    private let bestTakeAudioPluginClass = BestTakeAudioPlugin.self
    private let dronePluginClass = DronePlugin.self

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        _ = bestTakeAudioPluginClass
        _ = dronePluginClass
        lockInterfaceToPortrait()
        configurePersistentAudioSession()
        installAudioRouteObserver()
        installAudioInterruptionObserver()
        return true
    }

    private func installAudioInterruptionObserver() {
        let session = AVAudioSession.sharedInstance()
        audioInterruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: session,
            queue: .main
        ) { notification in
            let typeRaw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let type = typeRaw.flatMap { AVAudioSession.InterruptionType(rawValue: $0) }
            let reasonRaw: UInt? = {
                if #available(iOS 14.5, *) {
                    return notification.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt
                }
                return nil
            }()
            let wasSuspended = notification.userInfo?[AVAudioSessionInterruptionWasSuspendedKey] as? Bool
            let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt
            let options = optionsRaw.flatMap { AVAudioSession.InterruptionOptions(rawValue: $0) }
            if type == .began {
                AudioRouteConfigurator.noteInterruptionBegan()
            }
            let snapshot = AudioRouteConfigurator.routeSnapshot(for: session)
            print(
                "[AVAudioSessionInterruption] type=\(String(describing: type)) " +
                "reason=\(String(describing: reasonRaw)) wasSuspended=\(String(describing: wasSuspended)) " +
                "options=\(String(describing: options)) " +
                "category=\(snapshot["category"] as? String ?? "unknown") " +
                "mode=\(snapshot["mode"] as? String ?? "unknown") " +
                "active=\(session.isOtherAudioPlaying) otherAudioPlaying=\(session.isOtherAudioPlaying) " +
                "route=\(snapshot["outputPort"] as? String ?? "unknown")"
            )
        }
    }

    private func installAudioRouteObserver() {
        audioRouteObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { notification in
            let reasonRaw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            let reason = reasonRaw.flatMap { AVAudioSession.RouteChangeReason(rawValue: $0) }
            AudioRouteConfigurator.logRoute("route-change event (passive) reason=\(String(describing: reason))")
            AudioRouteConfigurator.logMicRouteProof(context: "routeChange.\(String(describing: reason))")
        }
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return .portrait
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        CameraSessionGuard.markForegroundActivation()
        lockInterfaceToPortrait()
        configurePersistentAudioSession()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        CameraSessionGuard.markForegroundActivation()
        lockInterfaceToPortrait()
        configurePersistentAudioSession()
    }

    /// Passive launch session — do not force HQ/headphone routes; JS applies on user action.
    /// Skips while native camera preview/recording is live so we don't stomp the
    /// videoRecording profile and silently drop the movie audio connection.
    private func configurePersistentAudioSession() {
        if CameraSessionGuard.isCameraOrRecordingActive || NativeCameraRecordingEngine.shared.isNativeRecordingActive {
            print("[AVAudioSessionTrace] configurePersistentAudioSession skipped — camera/recording active")
            return
        }
        let session = AVAudioSession.sharedInstance()
        do {
            try AudioRouteConfigurator.debugSetCategory(
                session,
                category: .playAndRecord,
                mode: .default,
                options: [.mixWithOthers, .allowBluetoothA2DP, .defaultToSpeaker],
                caller: "AppDelegate.configurePersistentAudioSession"
            )
            try AudioRouteConfigurator.ensureSessionActive(
                session,
                caller: "AppDelegate.configurePersistentAudioSession"
            )
            AudioRouteConfigurator.logRoute("launch passive session")
        } catch {
            print("Failed to configure passive audio session: \(error.localizedDescription)")
        }
    }

    private func lockInterfaceToPortrait() {
        if #available(iOS 16.0, *) {
            guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene else {
                return
            }
            windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) { _ in
                /* ignore — portrait lock is best-effort on resume */
            }
        } else {
            UIDevice.current.setValue(UIInterfaceOrientation.portrait.rawValue, forKey: "orientation")
            UIViewController.attemptRotationToDeviceOrientation()
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        AudioRouteConfigurator.suspendForAppBackground()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        AudioRouteConfigurator.suspendForAppBackground()
    }

    func applicationWillTerminate(_ application: UIApplication) {
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
