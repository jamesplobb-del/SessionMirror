import AppIntents
import Foundation

@available(iOS 16.0, *)
struct OpenQuickTunerIntent: AppIntent {
    static let title: LocalizedStringResource = "Open Quick Tuner"
    static let description = IntentDescription(
        "Opens BestTake directly to a lightweight live tuner."
    )

    @available(iOS, introduced: 16.0, obsoleted: 26.0)
    static var openAppWhenRun: Bool { true }

    @available(iOS 26.0, *)
    static var supportedModes: IntentModes {
        .foreground(.immediate)
    }

    func perform() async throws -> some IntentResult {
        #if QUICK_TUNER_CONTROL_EXTENSION
        let source: QuickTunerLaunchSource = .systemControl
        #else
        let source: QuickTunerLaunchSource = .siriOrShortcuts
        #endif
        QuickTunerLaunchCoordinator.shared.enqueue(
            source: source,
            coldLaunch: false
        )
        return .result()
    }
}

#if !QUICK_TUNER_CONTROL_EXTENSION
@available(iOS 16.0, *)
struct BestTakeAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenQuickTunerIntent(),
            phrases: [
                "Open \(.applicationName) tuner",
                "Open the tuner in \(.applicationName)",
                "Start \(.applicationName) tuner",
                "Tune with \(.applicationName)",
                "\(.applicationName) quick tuner",
            ],
            shortTitle: "Quick Tuner",
            systemImageName: "tuningfork"
        )
    }
}
#endif
