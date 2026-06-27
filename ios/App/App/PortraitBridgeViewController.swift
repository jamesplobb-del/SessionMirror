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
        configureWebViewForNativePreview()
    }

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if nativePreviewHostView.superview != nil {
            nativePreviewHostView.frame = view.bounds
        }
        NativeCameraRecordingEngine.shared.layoutPreview(in: nativePreviewHostView)
    }

    private func configureNativePreviewHostView() {
        nativePreviewHostView.backgroundColor = .black
        nativePreviewHostView.clipsToBounds = true
        nativePreviewHostView.isUserInteractionEnabled = false
        nativePreviewHostView.frame = view.bounds

        if nativePreviewHostView.superview == nil {
            if let webView = self.webView {
                view.insertSubview(nativePreviewHostView, belowSubview: webView)
            } else {
                view.insertSubview(nativePreviewHostView, at: 0)
            }
        } else if let webView = self.webView {
            view.insertSubview(nativePreviewHostView, belowSubview: webView)
        }
    }

    private func configureWebViewForNativePreview() {
        guard let webView = self.webView else { return }

        webView.configuration.allowsInlineMediaPlayback = true
        webView.configuration.mediaTypesRequiringUserActionForPlayback = []
        webView.isOpaque = true
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = .black
        }
        view.bringSubviewToFront(webView)
    }
}
