import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// Exercise the production renderer without opening an audio device. Only graph
// setup is omitted; synthesis, control state and render callback are unchanged.
const temp = await mkdtemp(join(tmpdir(), 'drone-renderer-'))
try {
  let source = await readFile('ios/App/App/DroneEngine.swift', 'utf8')
  const start = source.indexOf('    private init() {')
  const end = source.indexOf('\n    deinit {', start)
  assert.ok(start > 0 && end > start)
  source = source.slice(0, start) + '    private init() {}\n' + source.slice(end)
  source += `
private enum AudioRouteConfigurator {
    static func prepareMetronomePlaybackSessionIfNeeded() throws {}
}
extension DroneEngine {
    static func verifyRenderer() {
        let drone = DroneEngine()
        let frames: AVAudioFrameCount = 256
        let buffer = AVAudioPCMBuffer(pcmFormat: drone.renderFormat, frameCapacity: frames)!
        buffer.frameLength = frames
        func render() -> Float {
            precondition(drone.render(frameCount: frames, audioBufferList: buffer.mutableAudioBufferList) == noErr)
            var peak: Float = 0
            for channel in 0..<2 {
                for frame in 0..<Int(frames) {
                    let sample = buffer.floatChannelData![channel][frame]
                    precondition(sample.isFinite && abs(sample) <= 0.97, "Invalid/clipped audio")
                    peak = max(peak, abs(sample))
                }
            }
            return peak
        }
        func notes(_ values: [Int]) {
            drone.stateLock.lock()
            for key in drone.voices.keys { drone.fadeVoice(pitchClass: key, to: 0) }
            for key in values {
                drone.attachVoiceIfNeeded(pitchClass: key)
                drone.updateVoiceFrequency(pitchClass: key)
                drone.fadeVoice(pitchClass: key, to: 1)
            }
            drone.stateLock.unlock()
        }
        notes([9])
        for _ in 0..<30 { _ = render() }
        precondition(render() > 0.83, "Default drone volume should be clearly audible")
        // Simulate a control thread held up while the audio deadline arrives.
        // A blocking render lock deadlocks here; the executable has a timeout.
        drone.stateLock.lock()
        let before = Date()
        for _ in 0..<20 { precondition(render() > 0.1) }
        precondition(Date().timeIntervalSince(before) < 0.2, "Render waited on controls")
        drone.stateLock.unlock()
        let started = Date()
        for step in 0..<1200 {
            drone.setOctave(step % 9)
            drone.setWaveform(DroneWaveform.allCases[step % 4].rawValue)
            drone.setVolume(Float(step % 11) / 10)
            notes(step % 3 == 0 ? Array(0..<12) : [step % 12])
            _ = render()
        }
        let elapsed = Date().timeIntervalSince(started)
        precondition(elapsed < Double(1200 * frames) / 48000, "Renderer cannot keep up with real time")
        notes([])
        for _ in 0..<40 { _ = render() }
        precondition(render() < 0.000001, "Stop must reach silence")
        print("PASS: native Swift renderer, 1200 pitch/timbre/volume/chord changes, finite bounded stereo audio, contended lock, stop fade; stress seconds=\\(elapsed)")
    }
}
DroneEngine.verifyRenderer()
`
  await writeFile(join(temp, 'main.swift'), source)
  execFileSync('swiftc', ['-O', '-module-cache-path', join(temp, 'cache'), join(temp, 'main.swift'), '-o', join(temp, 'verify')], { timeout: 90000, stdio: 'pipe' })
  console.log(execFileSync(join(temp, 'verify'), [], { timeout: 20000, encoding: 'utf8' }).trim())
} finally {
  await rm(temp, { recursive: true, force: true })
}
