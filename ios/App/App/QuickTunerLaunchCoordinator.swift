import Foundation

enum QuickFunctionDestination: String, Codable {
    case tuner
    case metronome
}

enum QuickTunerLaunchSource: String, Codable {
    case lockScreen
    case controlCenter
    case actionButton
    case siriOrShortcuts
    case homeScreenQuickAction
    case inAppSettings
    case deepLink
    case systemControl
}

struct QuickTunerLaunchRequest: Codable, Equatable {
    let id: String
    let destination: QuickFunctionDestination
    let source: QuickTunerLaunchSource
    let requestedAt: Double
    var coldLaunch: Bool

    private enum CodingKeys: String, CodingKey {
        case id
        case destination
        case source
        case requestedAt
        case coldLaunch
    }

    init(
        id: String,
        destination: QuickFunctionDestination,
        source: QuickTunerLaunchSource,
        requestedAt: Double,
        coldLaunch: Bool
    ) {
        self.id = id
        self.destination = destination
        self.source = source
        self.requestedAt = requestedAt
        self.coldLaunch = coldLaunch
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        destination =
            try container.decodeIfPresent(QuickFunctionDestination.self, forKey: .destination)
            ?? .tuner
        source = try container.decode(QuickTunerLaunchSource.self, forKey: .source)
        requestedAt = try container.decode(Double.self, forKey: .requestedAt)
        coldLaunch = try container.decode(Bool.self, forKey: .coldLaunch)
    }

    var bridgePayload: [String: Any] {
        [
            "id": id,
            "destination": destination.rawValue,
            "source": source.rawValue,
            "requestedAt": requestedAt,
            "coldLaunch": coldLaunch,
        ]
    }
}

extension Notification.Name {
    static let quickTunerLaunchAvailable = Notification.Name(
        "com.besttake.app.quickTunerLaunchAvailable"
    )
}

final class QuickTunerLaunchCoordinator {
    static let shared = QuickTunerLaunchCoordinator()
    static let appGroupIdentifier = "group.com.besttake.app.quicktuner"
    static let tunerHomeScreenShortcutType = "com.besttake.app.quickTuner"
    static let metronomeHomeScreenShortcutType = "com.besttake.app.quickMetronome"

    private let pendingKey = "quickTuner.pendingLaunches.v1"
    private let lastConsumedKey = "quickTuner.lastConsumedLaunchID.v1"
    private let queue = DispatchQueue(label: "com.besttake.app.quick-tuner-launch")
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private var defaults: UserDefaults {
        UserDefaults(suiteName: Self.appGroupIdentifier) ?? .standard
    }

    private init() {}

    @discardableResult
    func enqueue(
        destination: QuickFunctionDestination,
        source: QuickTunerLaunchSource,
        coldLaunch: Bool
    ) -> QuickTunerLaunchRequest {
        let request = queue.sync { () -> QuickTunerLaunchRequest in
            var pending = loadPending()
            let now = Date().timeIntervalSince1970 * 1_000

            if let recent = pending.last,
               recent.destination == destination,
               recent.source == source,
               now - recent.requestedAt < 750 {
                print(
                    "[QuickTuner] duplicate launch coalesced " +
                    "destination=\(destination.rawValue) source=\(source.rawValue) " +
                    "id=\(recent.id)"
                )
                return recent
            }

            let request = QuickTunerLaunchRequest(
                id: UUID().uuidString,
                destination: destination,
                source: source,
                requestedAt: now,
                coldLaunch: coldLaunch
            )
            pending.append(request)
            if pending.count > 8 {
                pending.removeFirst(pending.count - 8)
            }
            storePending(pending)
            print(
                "[QuickTuner] pending destination stored destination=\(destination.rawValue) " +
                "source=\(source.rawValue) cold=\(coldLaunch) id=\(request.id)"
            )
            return request
        }

        announcePendingAvailability()
        return request
    }

    func consumePendingLaunch() -> QuickTunerLaunchRequest? {
        queue.sync {
            var pending = loadPending()
            let lastConsumedID = defaults.string(forKey: lastConsumedKey)

            while let request = pending.first {
                pending.removeFirst()
                if request.id == lastConsumedID {
                    continue
                }

                defaults.set(request.id, forKey: lastConsumedKey)
                storePending(pending)
                print(
                    "[QuickTuner] destination delivered " +
                    "destination=\(request.destination.rawValue) " +
                    "source=\(request.source.rawValue) cold=\(request.coldLaunch) " +
                    "id=\(request.id)"
                )
                return request
            }

            storePending([])
            return nil
        }
    }

    func refreshPendingFromSharedStore(coldLaunch: Bool) {
        let hasPending = queue.sync { () -> Bool in
            var pending = loadPending()
            guard !pending.isEmpty else { return false }

            if coldLaunch, pending[0].coldLaunch == false {
                pending[0].coldLaunch = true
                storePending(pending)
            }
            return true
        }

        if hasPending {
            print("[QuickTuner] pending launch announced cold=\(coldLaunch)")
            announcePendingAvailability()
        }
    }

    func handleDeepLink(_ url: URL, coldLaunch: Bool) -> Bool {
        guard url.scheme?.lowercased() == "besttake",
              let host = url.host?.lowercased() else {
            return false
        }

        let destination: QuickFunctionDestination
        switch host {
        case "quick-tuner", "tuner":
            destination = .tuner
        case "quick-metronome", "metronome":
            destination = .metronome
        default:
            return false
        }

        let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
        let rawSource = components?.queryItems?
            .first(where: { $0.name == "source" })?
            .value
        let source = rawSource.flatMap(QuickTunerLaunchSource.init(rawValue:)) ?? .deepLink
        enqueue(destination: destination, source: source, coldLaunch: coldLaunch)
        return true
    }

    static func homeScreenDestination(for shortcutType: String) -> QuickFunctionDestination? {
        switch shortcutType {
        case tunerHomeScreenShortcutType:
            return .tuner
        case metronomeHomeScreenShortcutType:
            return .metronome
        default:
            return nil
        }
    }

    private func announcePendingAvailability() {
        DispatchQueue.main.async {
            NotificationCenter.default.post(
                name: .quickTunerLaunchAvailable,
                object: nil
            )
        }
    }

    private func loadPending() -> [QuickTunerLaunchRequest] {
        guard let data = defaults.data(forKey: pendingKey),
              let pending = try? decoder.decode([QuickTunerLaunchRequest].self, from: data) else {
            return []
        }
        return pending
    }

    private func storePending(_ pending: [QuickTunerLaunchRequest]) {
        guard let data = try? encoder.encode(pending) else { return }
        defaults.set(data, forKey: pendingKey)
        defaults.synchronize()
    }
}
