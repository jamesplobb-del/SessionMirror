import Capacitor

@objc(DronePlugin)
public class DronePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DronePlugin"
    public let jsName = "DronePlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "toggleNote", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "soloNote", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOctave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVolume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWaveform", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restoreState", returnType: CAPPluginReturnPromise),
    ]

    private let engine = DroneEngine.shared

    private func statePayload() -> JSObject {
        var result = JSObject()
        result["activeNotes"] = engine.activeNotes()
        result["octave"] = engine.currentOctave()
        result["volume"] = engine.currentVolume()
        result["waveform"] = engine.currentWaveform()
        result["enabled"] = !engine.activeNotes().isEmpty
        return result
    }

    @objc func start(_ call: CAPPluginCall) {
        engine.start()
        call.resolve(statePayload())
    }

    @objc func stop(_ call: CAPPluginCall) {
        engine.stop()
        call.resolve(statePayload())
    }

    @objc func toggleNote(_ call: CAPPluginCall) {
        guard let pitchClass = call.getInt("pitchClass") else {
            call.reject("pitchClass is required")
            return
        }
        let active = engine.toggleNote(pitchClass: pitchClass)
        var result = statePayload()
        result["pitchClass"] = pitchClass
        result["noteActive"] = active
        call.resolve(result)
    }

    @objc func soloNote(_ call: CAPPluginCall) {
        guard let pitchClass = call.getInt("pitchClass") else {
            call.reject("pitchClass is required")
            return
        }
        if let octave = call.getInt("octave") {
            engine.setOctave(octave)
        }
        let active = engine.soloNote(pitchClass: pitchClass)
        var result = statePayload()
        result["pitchClass"] = pitchClass
        result["noteActive"] = active
        call.resolve(result)
    }

    @objc func setOctave(_ call: CAPPluginCall) {
        guard let octave = call.getInt("octave") else {
            call.reject("octave is required")
            return
        }
        engine.setOctave(octave)
        call.resolve(statePayload())
    }

    @objc func setVolume(_ call: CAPPluginCall) {
        let volume = Float(call.getFloat("volume") ?? 0.75)
        engine.setVolume(volume)
        call.resolve(statePayload())
    }

    @objc func setWaveform(_ call: CAPPluginCall) {
        engine.setWaveform(call.getString("waveform"))
        call.resolve(statePayload())
    }

    @objc func getState(_ call: CAPPluginCall) {
        call.resolve(statePayload())
    }

    @objc func restoreState(_ call: CAPPluginCall) {
        let rawNotes = call.getArray("activeNotes") ?? []
        let notes = rawNotes.compactMap { entry -> Int? in
            if let value = entry as? Int { return value }
            if let value = entry as? NSNumber { return value.intValue }
            return nil
        }
        let octave = call.getInt("octave") ?? 4
        let volume = Float(call.getFloat("volume") ?? 0.75)
        let waveform = call.getString("waveform")
        engine.restoreState(activeNotes: notes, octave: octave, volume: volume, waveform: waveform)
        call.resolve(statePayload())
    }
}
