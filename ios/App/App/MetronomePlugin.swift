import Capacitor
import Foundation

@objc(MetronomePlugin)
public class MetronomePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MetronomePlugin"
    public let jsName = "MetronomePlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setMuted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPlaying", returnType: CAPPluginReturnPromise),
    ]

    private let engine = MetronomeEngine.shared

    override public func load() {
        super.load()
        engine.setEventHandlers(
            pulse: { [weak self] beatIndex, subTickIndex, beatPulseId in
                self?.notifyListeners("metronomePulse", data: [
                    "beatIndex": beatIndex,
                    "subTickIndex": subTickIndex,
                    "beatPulseId": beatPulseId,
                ])
            },
            bar: { [weak self] in
                self?.notifyListeners("metronomeBar", data: [:])
            }
        )
    }

    private func parseTierPattern(_ raw: [Any]?) -> [MetronomeClickTier?] {
        guard let raw = raw else { return [] }
        return raw.map { entry -> MetronomeClickTier? in
            if entry is NSNull { return nil }
            guard let value = entry as? String, !value.isEmpty else { return nil }
            return MetronomeClickTier(rawValue: value)
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let tierRaw = call.getArray("tierPattern") else {
            call.reject("tierPattern is required")
            return
        }
        let ticksPerBar = call.getInt("ticksPerBar") ?? 4
        let pulseTicks = call.getInt("pulseTicks") ?? 1
        let secondsPerTick = call.getDouble("secondsPerTick") ?? 0.5
        let soundId = call.getString("soundId") ?? "classic"
        let muted = call.getBool("muted") ?? false
        let leadSec = call.getDouble("leadSec") ?? 0.05

        do {
            let result = try engine.start(
                tierPattern: parseTierPattern(tierRaw),
                ticksPerBar: ticksPerBar,
                pulseTicks: pulseTicks,
                secondsPerTick: secondsPerTick,
                soundId: soundId,
                muted: muted,
                leadSec: leadSec
            )
            call.resolve(result)
        } catch {
            call.reject("Failed to start native metronome", nil, error)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        engine.stop()
        call.resolve(["playing": false])
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let tierRaw = call.getArray("tierPattern") else {
            call.reject("tierPattern is required")
            return
        }
        let ticksPerBar = call.getInt("ticksPerBar") ?? 4
        let pulseTicks = call.getInt("pulseTicks") ?? 1
        let secondsPerTick = call.getDouble("secondsPerTick") ?? 0.5
        let soundId = call.getString("soundId") ?? "classic"
        engine.updateTiming(
            tierPattern: parseTierPattern(tierRaw),
            ticksPerBar: ticksPerBar,
            pulseTicks: pulseTicks,
            secondsPerTick: secondsPerTick,
            soundId: soundId
        )
        call.resolve(["playing": engine.isPlaying()])
    }

    @objc func setMuted(_ call: CAPPluginCall) {
        engine.setMuted(call.getBool("muted") ?? false)
        call.resolve(["muted": call.getBool("muted") ?? false])
    }

    @objc func prepare(_ call: CAPPluginCall) {
        do {
            if CameraSessionGuard.needsCoexistentPlaybackRoute {
                _ = try AudioRouteConfigurator.applyCoexistentPlaybackSpeakerRoute()
            } else {
                _ = try AudioRouteConfigurator.applyWebPlaybackRoute(webPlaybackActive: true)
            }
            call.resolve(["prepared": true])
        } catch {
            call.reject("Failed to prepare metronome session", nil, error)
        }
    }

    @objc func isPlaying(_ call: CAPPluginCall) {
        call.resolve(["playing": engine.isPlaying()])
    }
}
