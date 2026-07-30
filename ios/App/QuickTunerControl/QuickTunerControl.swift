import AppIntents
import SwiftUI
import WidgetKit

struct QuickTunerControl: ControlWidget {
    static let kind = "com.besttake.app.quickTuner.control"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickTunerIntent()) {
                Label("Quick Tuner", systemImage: "tuningfork")
            }
        }
        .displayName("Quick Tuner")
        .description("Open BestTake directly to the live tuner.")
    }
}

struct QuickMetronomeControl: ControlWidget {
    static let kind = "com.besttake.app.quickMetronome.control"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenQuickMetronomeIntent()) {
                Label("Metronome", systemImage: "metronome")
            }
        }
        .displayName("Metronome")
        .description("Open BestTake directly to the metronome.")
    }
}
