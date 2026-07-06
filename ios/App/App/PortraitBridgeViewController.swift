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
        view.backgroundColor = .black
        view.isOpaque = true
        configureWebViewForNativePreview()
    }

    override open func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if nativePreviewHostView.superview != nil {
            nativePreviewHostView.frame = view.bounds
        }
        NativeCameraRecordingEngine.shared.layoutPreview(in: nativePreviewHostView)
    }

    /// Reveal (or hide) the native AVCaptureVideoPreviewLayer that lives behind the
    /// WebView by toggling WebView opacity. Only called once native preview has
    /// actually started, so a native failure never leaves a transparent (black) shell.
    func setCameraPassthrough(_ enabled: Bool) {
        guard let webView = self.webView else { return }

        if enabled {
            view.backgroundColor = .black
            _ = nativeCameraPreviewContainer
            nativePreviewHostView.isHidden = false
            nativePreviewHostView.backgroundColor = .black
            nativePreviewHostView.layoutIfNeeded()
            NativeCameraRecordingEngine.shared.layoutPreview(in: nativePreviewHostView)
            clearWebViewForPassthrough(webView)
            view.bringSubviewToFront(webView)
        } else {
            webView.isOpaque = true
            webView.backgroundColor = .black
            webView.layer.backgroundColor = UIColor.black.cgColor
            webView.scrollView.isOpaque = true
            webView.scrollView.backgroundColor = .black
            webView.scrollView.layer.backgroundColor = UIColor.black.cgColor
            if #available(iOS 15.0, *) {
                webView.underPageBackgroundColor = .black
            }
            nativePreviewHostView.isHidden = true
            view.bringSubviewToFront(webView)
        }
    }

    /// WKWebView scroll-view backgrounds default to white and block the native preview.
    /// Only clear the web view chrome — do not recurse into content subviews or the HUD disappears.
    private func clearWebViewForPassthrough(_ webView: WKWebView) {
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.layer.backgroundColor = UIColor.clear.cgColor
        webView.scrollView.isOpaque = false
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.layer.backgroundColor = UIColor.clear.cgColor
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = .clear
        }
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
