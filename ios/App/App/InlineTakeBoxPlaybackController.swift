import AVFoundation
import Capacitor
import UIKit

/// Native AVPlayer overlay for BestTakeBox quick preview — decodes outside WKWebView
/// so the live camera JPEG bridge is not starved on the main thread.
final class InlineTakeBoxPlaybackController {
    static let shared = InlineTakeBoxPlaybackController()

    private var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    private var containerView: UIView?
    private var endObserver: NSObjectProtocol?
    private weak var plugin: CAPPlugin?
    private var mirrored = false

    private init() {}

    var isActive: Bool {
        player != nil
    }

    @discardableResult
    func start(
        plugin: CAPPlugin,
        fileURL: URL,
        frameInWindow: CGRect,
        mirror: Bool,
        volume: Float
    ) throws -> [String: Any] {
        stop(notify: false)

        self.plugin = plugin
        self.mirrored = mirror

        // Speaker route is primed from JS via prepareInlineTakeBoxPlaybackRoute().

        guard let webView = plugin.bridge?.webView,
              let host = webView.superview else {
            throw NSError(
                domain: "InlineTakeBoxPlayback",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "WebView host unavailable"]
            )
        }

        let frame = host.convert(frameInWindow, from: nil)

        let view = UIView(frame: frame)
        view.backgroundColor = .black
        view.isUserInteractionEnabled = false
        view.clipsToBounds = true
        view.accessibilityIdentifier = "inline-take-box-playback"

        let item = AVPlayerItem(url: fileURL)
        let player = AVPlayer(playerItem: item)
        player.volume = volume

        let layer = AVPlayerLayer(player: player)
        layer.frame = view.bounds
        layer.videoGravity = .resizeAspectFill
        applyMirrorTransform(to: layer, in: view.bounds, mirror: mirror)
        view.layer.addSublayer(layer)

        host.insertSubview(view, aboveSubview: webView)

        self.player = player
        self.playerLayer = layer
        self.containerView = view

        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            self?.stop(notify: true)
        }

        player.play()

        let durationSeconds = CMTimeGetSeconds(item.asset.duration)
        let safeDuration = durationSeconds.isFinite && durationSeconds > 0 ? durationSeconds : 0

        print("[InlineTakeBoxPlayback] started fileURL=\(fileURL.lastPathComponent) duration=\(safeDuration)")

        return [
            "fileURL": fileURL.absoluteString,
            "duration": safeDuration,
        ]
    }

    func updateLayout(plugin: CAPPlugin, frameInWindow: CGRect) {
        guard let webView = plugin.bridge?.webView,
              let host = webView.superview,
              let view = containerView,
              let layer = playerLayer else { return }

        let frame = host.convert(frameInWindow, from: nil)
        view.frame = frame
        layer.frame = view.bounds
        applyMirrorTransform(to: layer, in: view.bounds, mirror: mirrored)
    }

    func setVolume(_ volume: Float) {
        player?.volume = max(0, min(1, volume))
    }

    func pause() {
        player?.pause()
    }

    func stop(notify: Bool = true) {
        if let endObserver = endObserver {
            NotificationCenter.default.removeObserver(endObserver)
            self.endObserver = nil
        }
        player?.pause()
        player = nil
        playerLayer?.removeFromSuperlayer()
        playerLayer = nil
        containerView?.removeFromSuperview()
        containerView = nil

        if notify {
            plugin?.notifyListeners("inlineTakeBoxPlaybackEnded", data: [:])
        }
    }

    private func applyMirrorTransform(to layer: AVPlayerLayer, in bounds: CGRect, mirror: Bool) {
        if mirror {
            layer.setAffineTransform(CGAffineTransform(scaleX: -1, y: 1))
        } else {
            layer.setAffineTransform(.identity)
        }
        layer.frame = bounds
    }
}
