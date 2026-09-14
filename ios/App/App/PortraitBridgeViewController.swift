import Capacitor
import UIKit
import WebKit

@objc(PortraitBridgeViewController)
class PortraitBridgeViewController: CAPBridgeViewController {
    private let nativePreviewHostView = UIView()
    private let hapticsHandler = ImmediateHapticsHandler()
    private weak var hapticsContentController: WKUserContentController?

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
        bridge?.registerPluginInstance(OfferCodesPlugin())
        if let controller = webView?.configuration.userContentController,
           hapticsContentController !== controller {
            hapticsContentController?.removeScriptMessageHandler(forName: "bestTakeHaptics")
            controller.add(hapticsHandler, name: "bestTakeHaptics")
            hapticsContentController = controller
            hapticsHandler.prepare()
        }
        configureWebViewForNativePreview()
    }

    deinit {
        hapticsContentController?.removeScriptMessageHandler(forName: "bestTakeHaptics")
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

/// A tiny, one-way UI channel. Capacitor dispatches plugin calls on one serial
/// queue, where audio route changes can hold up a tap. This handler owns no
/// WebView/controller references and never performs audio or filesystem work.
private final class ImmediateHapticsHandler: NSObject, WKScriptMessageHandler {
    private let impacts: [String: UIImpactFeedbackGenerator] = [
        "light": UIImpactFeedbackGenerator(style: .light),
        "medium": UIImpactFeedbackGenerator(style: .medium),
        "heavy": UIImpactFeedbackGenerator(style: .heavy),
        "soft": UIImpactFeedbackGenerator(style: .soft),
        "rigid": UIImpactFeedbackGenerator(style: .rigid),
    ]
    private let notification = UINotificationFeedbackGenerator()

    func prepare() {
        impacts.values.forEach { $0.prepare() }
        notification.prepare()
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        // Embedded references (YouTube, etc.) cannot trigger app feedback.
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url,
              url.scheme == "capacitor", url.host == "localhost",
              UIApplication.shared.applicationState == .active,
              let body = message.body as? [String: Any],
              let kind = body["kind"] as? String,
              let sentAt = body["sentAt"] as? Double else { return }
        let ageMs = Date().timeIntervalSince1970 * 1000 - sentAt
        // Never replay a backlog of tactile clicks after an interruption.
        guard ageMs >= -1000, ageMs < 250 else { return }

        switch kind {
        case "prepare":
            prepare()
        case "impact":
            guard let style = body["style"] as? String,
                  let generator = impacts[style] else { return }
            if let intensity = body["intensity"] as? Double, intensity.isFinite {
                generator.impactOccurred(intensity: CGFloat(max(0, min(1, intensity))))
            } else {
                generator.impactOccurred()
            }
            generator.prepare()
        case "notification":
            let type: UINotificationFeedbackGenerator.FeedbackType
            switch body["type"] as? String {
            case "success": type = .success
            case "warning": type = .warning
            case "error": type = .error
            default: return
            }
            notification.notificationOccurred(type)
            notification.prepare()
        default:
            break
        }
    }
}
