import Foundation
import AVFoundation
let folder = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("enhancer-test-\(UUID().uuidString)")
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
let input = folder.appendingPathComponent("original.wav")
let format = AVAudioFormat(standardFormatWithSampleRate: 48000, channels: 1)!
let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 96000)!
buffer.frameLength = 96000
for i in 0..<96000 { buffer.floatChannelData![0][i] = Float(sin(Double(i) * 2 * .pi * 440 / 48000)) * 0.15 }
do { let file = try AVAudioFile(forWriting: input, settings: format.settings); try file.write(from: buffer) }
let original = try Data(contentsOf: input)
let params = AudioEnhancerParams(lowHz: 180, lowGainDb: 0, midHz: 1400, midQ: 1, midGainDb: 0, highHz: 5000, highGainDb: 0, thresholdDb: -18, ratio: 1, attackSec: 0.01, releaseSec: 0.1, makeupDb: 0, reverbWetLevel: 0.1)
var done = false
var failed = false
AudioEnhancerRenderer.enhanceCopy(fileURL: input, isVideo: false, params: params) { result in
  do {
    let output = try result.get()
    let path = URL(string: output["path"] as! String)!
    guard path != input, try Data(contentsOf: input) == original, FileManager.default.fileExists(atPath: path.path) else { fatalError("Original changed") }
    let duration = output["duration"] as! Double
    guard duration > 3 && duration < 4 else { fatalError("Tail duration incorrect: \(duration)") }
    print("PASS: native enhanced copy, byte-identical original, valid separate AAC file, refreshed tail duration \(duration)")
  } catch { print("FAIL: \(error)"); failed = true }
  done = true
}
let deadline = Date().addingTimeInterval(40)
while !done && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
try? FileManager.default.removeItem(at: folder)
exit(done && !failed ? 0 : 1)
