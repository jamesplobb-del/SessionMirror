import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var audioRouteObserver: NSObjectProtocol?

    /// Keep the Swift plugin class linked so Capacitor packageClassList can resolve it.
    private let bestTakeAudioPluginClass = BestTakeAudioPlugin.self

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        _ = bestTakeAudioPluginClass
        lockInterfaceToPortrait()
        configurePersistentAudioSession()
        installAudioRouteObserver()
        return true
    }

    private func installAudioRouteObserver() {
        audioRouteObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { _ in
            AudioRouteConfigurator.logRoute("route-change event (passive)")
        }
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

    /// Passive launch session — do not force HQ/headphone routes; JS applies on user action.
    private func configurePersistentAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try AudioRouteConfigurator.debugSetCategory(
                session,
                category: .playAndRecord,
                mode: .default,
                options: [.allowBluetoothA2DP, .defaultToSpeaker],
                caller: "AppDelegate.configurePersistentAudioSession"
            )
            try AudioRouteConfigurator.debugSetActive(
                session,
                active: true,
                options: [],
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
