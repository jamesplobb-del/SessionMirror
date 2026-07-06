import Foundation
import Capacitor
import AVFAudio

@objc(SessionMirrorAudioPlugin)
public class SessionMirrorAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionMirrorAudioPlugin"
    public let jsName = "SessionMirrorAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepareForTakePlayback", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareForMicCapture", returnType: CAPPluginReturnPromise),
    ]

    @objc func prepareForTakePlayback(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(.playback, mode: .default, options: [])
                try session.setActive(true, options: [])
                call.resolve()
            } catch {
                call.reject("prepareForTakePlayback failed", nil, error)
            }
        }
    }

    @objc func prepareForMicCapture(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                let session = AVAudioSession.sharedInstance()
                try session.setCategory(
                    .playAndRecord,
                    mode: .measurement,
                    options: [.defaultToSpeaker, .allowBluetoothA2DP, .allowBluetooth]
                )
                try session.overrideOutputAudioPort(.speaker)
                try session.setActive(true, options: [])
                call.resolve()
            } catch {
                call.reject("prepareForMicCapture failed", nil, error)
            }
        }
    }
}
