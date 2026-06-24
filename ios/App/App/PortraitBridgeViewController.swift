import Capacitor
import UIKit
import WebKit

@objc(PortraitBridgeViewController)
class PortraitBridgeViewController: CAPBridgeViewController {
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        .portrait
    }

    override var shouldAutorotate: Bool {
        false
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        registerBestTakeAudioPlugin()

        guard let webView = self.webView else { return }

        webView.configuration.allowsInlineMediaPlayback = true
        webView.configuration.mediaTypesRequiringUserActionForPlayback = []
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        registerBestTakeAudioPlugin()
    }

    private func registerBestTakeAudioPlugin() {
        bridge?.registerPluginInstance(BestTakeAudioPlugin())
    }
}
