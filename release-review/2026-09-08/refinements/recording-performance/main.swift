import Foundation
import AVFoundation
let root = URL(fileURLWithPath: "/tmp/besttake-level-bench")
for (name, seconds, channels, rate) in [("silence",2,1,48000),("dynamic",30,1,48000),("long-stereo",180,2,44100)] {
 let url = root.appendingPathComponent(name + ".wav")
 let t0=Date(); guard let before=Before.measureLevels(fileURL:url) else {fatalError("baseline failed")};let oldMs=Date().timeIntervalSince(t0)*1000
 let t1=Date(); guard let after=After.measureLevels(fileURL:url) else {fatalError("new failed")};let newMs=Date().timeIntervalSince(t1)*1000
 for (a,b) in [(before.peakDb,after.peakDb),(before.rmsDb,after.rmsDb),(before.activeRmsDb,after.activeRmsDb)] { precondition(abs(a-b)<0.000001,"level mismatch") }
 print("PASS \(name): matching peak/RMS/active RMS; oldMs=\(Int(oldMs)) newMs=\(Int(newMs))")
}
