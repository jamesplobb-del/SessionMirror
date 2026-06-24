import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /// Keep the Swift plugin class linked so NSClassFromString can resolve it.
    private let bestTakeAudioPluginClass = BestTakeAudioPlugin.self
    private var audioRouteObserver: NSObjectProtocol?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        lockInterfaceToPortrait()
        configurePersistentAudioSession()
        installAudioRouteObserver()
        DispatchQueue.main.async { [weak self] in
            self?.registerBestTakeAudioPlugin()
        }
        return true
    }

    private func installAudioRouteObserver() {
        audioRouteObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { _ in
            AudioRouteConfigurator.maintainHighQualityInputIfNeeded()
        }
    }

    private func registerBestTakeAudioPlugin() {
        _ = bestTakeAudioPluginClass
        guard let bridgeViewController = window?.rootViewController as? CAPBridgeViewController else {
            return
        }
        bridgeViewController.bridge?.registerPluginInstance(BestTakeAudioPlugin())
    }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return .portrait
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        lockInterfaceToPortrait()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        lockInterfaceToPortrait()
    }

    /// Initial recording route on cold launch only — do not call on every foreground
    /// resume or it will undo YouTube stereo playback (.playback category).
    private func configurePersistentAudioSession() {
        do {
            try AudioRouteConfigurator.applyRecordingRoute(
                enableHQ: AudioRouteConfigurator.isHighQualityModeEnabled()
            )
        } catch {
            print("Failed to configure persistent audio session: \(error)")
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
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
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
