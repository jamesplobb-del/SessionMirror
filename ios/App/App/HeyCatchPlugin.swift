import Capacitor
import PostHog

@MainActor
enum HeyCatchAnalytics {
    private static let projectKey = "hck_pk_wK8iu_UTOxuul0V4PWwOiKoY2nMsOLm9"
    private static let consentKey = "besttake.analytics.heycatch.enabled"
    private static let reportedTransactionsKey = "besttake.analytics.heycatch.transactions"
    private static var currentScreen: String?

    static var isEnabled: Bool { UserDefaults.standard.bool(forKey: consentKey) }

    static func startIfAllowed() {
        guard isEnabled else { return }
        let config = PostHogConfig(
            projectToken: "phc_oiDt6uXiBiEA2aT43SMzMAFE9D4gMVkRP3BtvYRsmHqe",
            host: "https://in.heycatch.ai"
        )
        // App screens are React views inside one UIKit controller. Report them through the bridge.
        config.captureScreenViews = false
        config.preloadFeatureFlags = false
        config.enableSwizzling = false
        #if DEBUG
        config.debug = ProcessInfo.processInfo.arguments.contains("-HeyCatchDebug")
        #endif
        PostHogSDK.shared.setup(config)
        PostHogSDK.shared.optIn()
        PostHogSDK.shared.register(["heycatch_project_key": projectKey])
        PostHogSDK.shared.group(type: "project", key: projectKey)
    }

    static func setEnabled(_ enabled: Bool) {
        guard enabled != isEnabled else { return }
        UserDefaults.standard.set(enabled, forKey: consentKey)
        if enabled {
            startIfAllowed()
            if let currentScreen { PostHogSDK.shared.screen(currentScreen) }
        } else {
            PostHogSDK.shared.optOut()
        }
    }

    static func screen(_ name: String) {
        guard currentScreen != name else { return }
        currentScreen = name
        if isEnabled { PostHogSDK.shared.screen(name) }
    }

    static func trackOnboarding(completed: Bool) {
        guard isEnabled else { return }
        PostHogSDK.shared.capture(completed ? "onboarding_completed" : "onboarding_skipped")
    }

    static func trackPurchase(event: String, transactionID: UInt64, productID: String) {
        guard isEnabled else { return }
        let defaults = UserDefaults.standard
        let key = String(transactionID)
        var reported = defaults.stringArray(forKey: reportedTransactionsKey) ?? []
        guard !reported.contains(key) else { return }
        reported.append(key)
        defaults.set(reported, forKey: reportedTransactionsKey)
        PostHogSDK.shared.capture(event, properties: ["product_id": productID])
    }
}

@objc(HeyCatchPlugin)
final class HeyCatchPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "HeyCatchPlugin"
    let jsName = "HeyCatch"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "screen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trackOnboarding", returnType: CAPPluginReturnPromise),
    ]

    @objc func getConsent(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["enabled": HeyCatchAnalytics.isEnabled]) }
    }

    @objc func setConsent(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else { call.reject("Missing analytics preference"); return }
        DispatchQueue.main.async {
            HeyCatchAnalytics.setEnabled(enabled)
            call.resolve(["enabled": HeyCatchAnalytics.isEnabled])
        }
    }

    @objc func screen(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), !name.isEmpty else { call.reject("Missing screen name"); return }
        DispatchQueue.main.async {
            HeyCatchAnalytics.screen(name)
            call.resolve()
        }
    }

    @objc func trackOnboarding(_ call: CAPPluginCall) {
        guard let completed = call.getBool("completed") else { call.reject("Missing onboarding outcome"); return }
        DispatchQueue.main.async {
            HeyCatchAnalytics.trackOnboarding(completed: completed)
            call.resolve()
        }
    }
}
