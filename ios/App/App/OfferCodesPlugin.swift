import Capacitor
import StoreKit
import UIKit

/// Presents Apple's UI only. Dismissal is not proof of a purchase or unlock.
@objc(OfferCodesPlugin)
public class OfferCodesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OfferCodesPlugin"
    public let jsName = "OfferCodes"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "redeem", returnType: CAPPluginReturnPromise),
    ]
    private var presenting = false

    @objc func redeem(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 16.3, *) else {
                call.reject("Code redemption requires iOS 16.3 or later.")
                return
            }
            guard !self.presenting else {
                call.reject("A redemption window is already open.")
                return
            }
            guard let scene = self.bridge?.viewController?.view.window?.windowScene,
                  scene.activationState == .foregroundActive else {
                call.reject("Return to BestTake and try again.")
                return
            }
            self.presenting = true
            defer { self.presenting = false }
            do {
                try await AppStore.presentOfferCodeRedeemSheet(in: scene)
                call.resolve()
            } catch {
                call.reject("Could not open code redemption. Please try again.")
            }
        }
    }
}
