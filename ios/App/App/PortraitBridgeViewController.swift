import Capacitor
import UIKit
import WebKit

@objc(PortraitBridgeViewController)
class PortraitBridgeViewController: CAPBridgeViewController {
    private let nativePreviewHostView = UIView()

    var nativeCameraPreviewContainer: UIView {
        configureNativePreviewHostView()
        return nativePreviewHostView
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        .portrait
    }

    override var shouldAutorotate: Bool {
        false
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        configureWebViewForNativePreview()
    }

    override open func viewDidLoad() {
        super.viewDidLoad()
        configureNativePreviewHostView()
        configureWebViewForNativePreview()
    }

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        configureNativePreviewHostView()
        nativePreviewHostView.frame = view.bounds
        NativeCameraRecordingEngine.shared.layoutPreview(in: nativePreviewHostView)
    }

    private func configureNativePreviewHostView() {
        guard nativePreviewHostView.superview == nil else { return }

        nativePreviewHostView.backgroundColor = .black
        nativePreviewHostView.clipsToBounds = true
        nativePreviewHostView.isUserInteractionEnabled = false
        nativePreviewHostView.frame = view.bounds
        view.insertSubview(nativePreviewHostView, at: 0)
    }

    private func configureWebViewForNativePreview() {
        guard let webView = self.webView else { return }

        webView.configuration.allowsInlineMediaPlayback = true
        webView.configuration.mediaTypesRequiringUserActionForPlayback = []
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = .clear
        }
    }
}
