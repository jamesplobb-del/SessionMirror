import AVFoundation
import Darwin

enum DroneWaveform: String, CaseIterable {
    case sine
    case triangle
    case organ
    case warmSynth

    static func parse(_ raw: String?) -> DroneWaveform {
        guard let raw = raw, let value = DroneWaveform(rawValue: raw) else {
            return .sine
        }
        return value
    }
}

/// Standalone reference-tone engine — decoupled from tuner pitch detection.
/// Uses one stable source node and mixes selected notes internally to avoid graph churn.
// BEGIN DRONE SOUND SYNTHESIS
/// Band-limited harmonic recipes, with a strong fundamental for tuning.
/// SIMD storage keeps timbre smoothing free of per-sample heap allocations.
func droneHarmonics(waveform: DroneWaveform, frequency: Float, sampleRate: Float) -> SIMD8<Float> {
    var weights: SIMD8<Float>
    switch waveform {
    case .sine: weights = SIMD8(1, 0, 0, 0, 0, 0, 0, 0)
    case .triangle: weights = SIMD8(1, 0, -1.0/9, 0, 1.0/25, 0, -1.0/49, 0)
    case .organ: weights = SIMD8(1, 0.32, 0.12, 0.06, 0, 0, 0, 0)
    case .warmSynth: weights = SIMD8(1, 0.16, 0.06, 0.02, 0, 0, 0, 0)
    }
    var total: Float = 0
    for index in 0..<8 {
        let hz = frequency * Float(index + 1)
        // Fade partials out before Nyquist, including the top keyboard octave.
        weights[index] *= max(0, min(1, (sampleRate * 0.48 - hz) / (sampleRate * 0.08)))
        total += abs(weights[index])
    }
    return weights / SIMD8(repeating: max(1, total))
}

func droneWaveSample(phase: Double, harmonics: SIMD8<Float>) -> Float {
    var sample: Float = 0
    for index in 0..<8 where abs(harmonics[index]) > 0.000001 {
        sample += harmonics[index] * Float(sin(phase * Double(index + 1)))
    }
    return sample
}
// END DRONE SOUND SYNTHESIS

final class DroneEngine {
    static let shared = DroneEngine()

    private let engine = AVAudioEngine()
    private let mainMixer = AVAudioMixerNode()
    private let renderFormat = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
    private lazy var sourceNode = AVAudioSourceNode(format: renderFormat) { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
        guard let self = self else { return noErr }
        return self.render(frameCount: frameCount, audioBufferList: audioBufferList)
    }

    private var voices: [Int: DroneVoice] = [:]
    // Owned exclusively by the audio callback; never copy a dictionary per sample.
    private var renderVoices = (0..<12).map { DroneVoice(pitchClass: $0) }
    private var renderVolume: Float = 0
    private var renderTargetVolume: Float = 0
    private let controlQueue = DispatchQueue(label: "com.besttake.drone.control", qos: .userInitiated)
    private var recoveryGeneration = 0
    private var octave = 4
    private var requestedVolume: Float = 0.75
    private var masterVolume: Float = DroneEngine.outputVolume(for: 0.75)
    private var waveform: DroneWaveform = .sine
    private var isRunning = false
    private var configurationObserver: NSObjectProtocol?
    private let stateLock = NSLock()

    private let fadeDuration: TimeInterval = 0.035
    private let oscillatorHeadroom: Float = 0.96
    private let speakerBusGain: Float = 1

    private init() {
        engine.attach(mainMixer)
        engine.attach(sourceNode)
        engine.connect(sourceNode, to: mainMixer, format: renderFormat)
        engine.connect(mainMixer, to: engine.outputNode, format: nil)
        mainMixer.outputVolume = 1

        configurationObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: nil
        ) { [weak self] _ in
            self?.handleEngineConfigurationChange()
        }
    }

    deinit {
        if let configurationObserver = configurationObserver {
            NotificationCenter.default.removeObserver(configurationObserver)
        }
    }

    // MARK: - Public API

    func start() {
        ensureEngineRunning()
    }

    func stop() {
        stateLock.lock()
        defer { stateLock.unlock() }

        for pitchClass in voices.keys {
            fadeVoice(pitchClass: pitchClass, to: 0)
        }

        controlQueue.asyncAfter(deadline: .now() + fadeDuration + 0.02) { [weak self] in
            guard let self = self else { return }
            self.stateLock.lock()
            self.detachIdleVoices()
            self.stateLock.unlock()
            self.stopEngineIfIdle()
        }
    }

    @discardableResult
    func toggleNote(pitchClass: Int) -> Bool {
        guard (0...11).contains(pitchClass) else { return false }

        stateLock.lock()

        if let voice = voices[pitchClass], voice.targetGain > 0.001 {
            fadeVoice(pitchClass: pitchClass, to: 0)
            scheduleDetachIfSilent(pitchClass: pitchClass)
            stateLock.unlock()
            return false
        }

        attachVoiceIfNeeded(pitchClass: pitchClass)
        updateVoiceFrequency(pitchClass: pitchClass)
        fadeVoice(pitchClass: pitchClass, to: 1)
        stateLock.unlock()
        ensureEngineRunning()
        return true
    }

    @discardableResult
    func soloNote(pitchClass: Int) -> Bool {
        guard (0...11).contains(pitchClass) else { return false }

        stateLock.lock()
        let activePitchClasses = voices.filter { $0.value.targetGain > 0.001 }.map(\.key).sorted()
        if activePitchClasses == [pitchClass] {
            stateLock.unlock()
            ensureEngineRunning()
            return true
        }

        for activePitchClass in activePitchClasses where activePitchClass != pitchClass {
            fadeVoice(pitchClass: activePitchClass, to: 0)
            scheduleDetachIfSilent(pitchClass: activePitchClass)
        }

        attachVoiceIfNeeded(pitchClass: pitchClass)
        updateVoiceFrequency(pitchClass: pitchClass)
        fadeVoice(pitchClass: pitchClass, to: 1)
        stateLock.unlock()
        ensureEngineRunning()
        return true
    }

    func setOctave(_ newOctave: Int) {
        let clamped = max(0, min(8, newOctave))
        stateLock.lock()
        guard clamped != octave else {
            stateLock.unlock()
            return
        }

        let activePitchClasses = voices.filter { $0.value.targetGain > 0.001 }.map(\.key)
        octave = clamped
        for pitchClass in activePitchClasses {
            updateVoiceFrequency(pitchClass: pitchClass)
        }
        stateLock.unlock()
    }

    func setVolume(_ volume: Float) {
        stateLock.lock()
        requestedVolume = max(0, min(1, volume))
        masterVolume = Self.outputVolume(for: requestedVolume)
        stateLock.unlock()
    }

    func setWaveform(_ raw: String?) {
        stateLock.lock()
        waveform = DroneWaveform.parse(raw)
        for pitchClass in voices.keys { updateVoiceFrequency(pitchClass: pitchClass) }
        stateLock.unlock()
    }

    func activeNotes() -> [Int] {
        stateLock.lock()
        defer { stateLock.unlock() }
        return voices
            .filter { $0.value.targetGain > 0.001 }
            .map(\.key)
            .sorted()
    }

    func currentOctave() -> Int {
        stateLock.lock()
        defer { stateLock.unlock() }
        return octave
    }

    func currentVolume() -> Float {
        stateLock.lock()
        defer { stateLock.unlock() }
        return requestedVolume
    }

    func currentWaveform() -> String {
        stateLock.lock()
        defer { stateLock.unlock() }
        return waveform.rawValue
    }

    func restoreState(activeNotes: [Int], octave: Int, volume: Float, waveform: String?) {
        stateLock.lock()
        self.octave = max(0, min(8, octave))
        requestedVolume = max(0, min(1, volume))
        masterVolume = Self.outputVolume(for: requestedVolume)
        self.waveform = DroneWaveform.parse(waveform)
        let notes = Set(activeNotes.filter { (0...11).contains($0) })
        for pitchClass in voices.keys where !notes.contains(pitchClass) {
            fadeVoice(pitchClass: pitchClass, to: 0)
            scheduleDetachIfSilent(pitchClass: pitchClass)
        }
        for pitchClass in notes {
            attachVoiceIfNeeded(pitchClass: pitchClass)
            updateVoiceFrequency(pitchClass: pitchClass)
            fadeVoice(pitchClass: pitchClass, to: 1)
        }
        stateLock.unlock()
        if notes.isEmpty {
            stopEngineIfIdle()
        } else {
            ensureEngineRunning()
        }
    }

    // MARK: - Voice management

    private struct DroneVoice {
        let pitchClass: Int
        var currentGain: Float = 0
        var targetGain: Float = 0
        var phase: Double = 0
        var frequency: Float = 440
        var targetFrequency: Float = 440
        var harmonics = SIMD8<Float>(repeating: 0)
        var targetHarmonics = SIMD8<Float>(repeating: 0)
    }

    private func midi(for pitchClass: Int) -> Int {
        (octave + 1) * 12 + pitchClass
    }

    private func frequency(for pitchClass: Int) -> Float {
        let midiNote = Float(midi(for: pitchClass))
        return 440 * pow(2, (midiNote - 69) / 12)
    }

    private func attachVoiceIfNeeded(pitchClass: Int) {
        if voices[pitchClass] != nil { return }
        var voice = DroneVoice(pitchClass: pitchClass)
        voice.frequency = frequency(for: pitchClass)
        voice.targetFrequency = voice.frequency
        voice.targetHarmonics = droneHarmonics(waveform: waveform, frequency: voice.frequency, sampleRate: Float(renderFormat.sampleRate))
        voices[pitchClass] = voice
    }

    private func render(frameCount: AVAudioFrameCount, audioBufferList: UnsafeMutablePointer<AudioBufferList>) -> OSStatus {
        // A real-time callback must never wait for a UI/bridge thread. If a
        // control update is in progress, keep rendering the previous targets.
        if stateLock.try() {
            for pitchClass in 0..<12 {
                if let voice = voices[pitchClass] {
                    if renderVoices[pitchClass].currentGain == 0 && voice.targetGain > 0 {
                        renderVoices[pitchClass].frequency = voice.targetFrequency
                    }
                    renderVoices[pitchClass].targetGain = voice.targetGain
                    renderVoices[pitchClass].targetFrequency = voice.targetFrequency
                    renderVoices[pitchClass].targetHarmonics = voice.targetHarmonics
                } else {
                    renderVoices[pitchClass].targetGain = 0
                }
            }
            renderTargetVolume = masterVolume
            stateLock.unlock()
        }

        let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
        let channelCount = Int(ablPointer.count)
        let frames = Int(frameCount)
        let twoPi = Double.pi * 2
        let sampleRate = Float(renderFormat.sampleRate)
        let fadeStep = Float(1.0 / (fadeDuration * renderFormat.sampleRate))
        let timbreSmoothing = Float(1 - exp(-1 / (0.012 * renderFormat.sampleRate)))
        let frequencySmoothing = Float(1 - exp(-1 / (0.008 * renderFormat.sampleRate)))

        for frame in 0..<frames {
            var mixed: Float = 0
            var totalGain: Float = 0

            for pitchClass in 0..<12 {
                var voice = renderVoices[pitchClass]
                if voice.currentGain <= 0 && voice.targetGain <= 0 { continue }

                if voice.currentGain < voice.targetGain {
                    voice.currentGain = min(voice.targetGain, voice.currentGain + fadeStep)
                } else if voice.currentGain > voice.targetGain {
                    voice.currentGain = max(voice.targetGain, voice.currentGain - fadeStep)
                }

                voice.frequency += (voice.targetFrequency - voice.frequency) * frequencySmoothing
                voice.harmonics += (voice.targetHarmonics - voice.harmonics) * SIMD8(repeating: timbreSmoothing)
                var audibleHarmonics = voice.harmonics
                for index in 0..<8 where voice.frequency * Float(index + 1) >= sampleRate * 0.48 {
                    audibleHarmonics[index] = 0
                }
                mixed += droneWaveSample(phase: voice.phase, harmonics: audibleHarmonics) * voice.currentGain
                totalGain += voice.currentGain
                voice.phase += twoPi * Double(voice.frequency / sampleRate)
                if voice.phase > twoPi { voice.phase -= twoPi }
                renderVoices[pitchClass] = voice
            }

            // Normalize by fading voice gains, so chord changes do not jump in level.
            renderVolume += (renderTargetVolume - renderVolume) * timbreSmoothing
            let sample = mixed / max(1, totalGain) * oscillatorHeadroom * speakerBusGain * renderVolume
            for channel in 0..<channelCount {
                guard let buffer = ablPointer[channel].mData?.assumingMemoryBound(to: Float.self) else { continue }
                buffer[frame] = sample
            }
        }

        if stateLock.try() {
            for pitchClass in 0..<12 {
                guard var liveVoice = voices[pitchClass] else { continue }
                liveVoice.currentGain = renderVoices[pitchClass].currentGain
                voices[pitchClass] = liveVoice
            }
            stateLock.unlock()
        }
        return noErr
    }

    private static func outputVolume(for requestedVolume: Float) -> Float {
        let clamped = max(0, min(1, requestedVolume))
        if clamped <= 0 { return 0 }
        return min(1, 0.08 + pow(clamped, 0.5) * 0.92)
    }

    private func fadeVoice(pitchClass: Int, to target: Float) {
        guard var voice = voices[pitchClass] else { return }
        voice.targetGain = max(0, min(1, target))
        voices[pitchClass] = voice
    }

    private func updateVoiceFrequency(pitchClass: Int) {
        guard var voice = voices[pitchClass] else { return }
        voice.targetFrequency = frequency(for: pitchClass)
        voice.targetHarmonics = droneHarmonics(waveform: waveform, frequency: voice.targetFrequency, sampleRate: Float(renderFormat.sampleRate))
        voices[pitchClass] = voice
    }

    private func scheduleDetachIfSilent(pitchClass: Int) {
        controlQueue.asyncAfter(deadline: .now() + fadeDuration + 0.04) { [weak self] in
            guard let self = self else { return }
            self.stateLock.lock()
            guard let voice = self.voices[pitchClass], voice.currentGain <= 0.001, voice.targetGain <= 0.001 else {
                self.stateLock.unlock()
                return
            }
            self.voices.removeValue(forKey: pitchClass)
            self.stateLock.unlock()
            self.stopEngineIfIdle()
        }
    }

    private func detachIdleVoices() {
        for pitchClass in voices.keys {
            guard let voice = voices[pitchClass], voice.currentGain <= 0.001, voice.targetGain <= 0.001 else {
                continue
            }
            voices.removeValue(forKey: pitchClass)
        }
    }

    private func ensureEngineRunning() {
        controlQueue.async { [weak self] in self?.startEngineIfNeeded() }
    }

    // All graph/session operations run serially, outside the UI and render locks.
    private func startEngineIfNeeded() {
        stateLock.lock()
        let shouldPlay = voices.contains { $0.value.targetGain > 0.001 }
        stateLock.unlock()
        guard shouldPlay else { return }
        if isRunning && engine.isRunning { return }
        isRunning = false

        do {
            try AudioRouteConfigurator.prepareMetronomePlaybackSessionIfNeeded()
            if !engine.isRunning {
                engine.prepare()
                try engine.start()
            }
            stateLock.lock()
            isRunning = true
            let activeNotes = voices.keys.sorted()
            let requestedVolume = self.requestedVolume
            let masterVolume = self.masterVolume
            stateLock.unlock()
            print(
                "[DroneEngine] started activeNotes=\(activeNotes) requestedVolume=\(requestedVolume) " +
                "outputVolume=\(masterVolume) speakerBusGain=\(speakerBusGain) path=direct"
            )
        } catch {
            stateLock.lock()
            isRunning = false
            stateLock.unlock()
            print("[DroneEngine] failed to start: \(error.localizedDescription)")
            engine.reset()
        }
    }

    private func handleEngineConfigurationChange() {
        controlQueue.async { [weak self] in
            guard let self else { return }
            self.recoveryGeneration &+= 1
            let generation = self.recoveryGeneration
            self.controlQueue.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                guard let self, generation == self.recoveryGeneration else { return }
                self.startEngineIfNeeded()
            }
        }
    }

    private func stopEngineIfIdle() {
        controlQueue.asyncAfter(deadline: .now() + fadeDuration + 0.02) { [weak self] in
            self?.stopIdleEngine()
        }
    }

    private func stopIdleEngine() {
        stateLock.lock()
        let hasAudibleVoice = voices.contains { $0.value.targetGain > 0.001 }
        if hasAudibleVoice {
            stateLock.unlock()
            return
        }
        voices.removeAll(keepingCapacity: true)
        isRunning = false
        stateLock.unlock()
        engine.stop()
        print("[DroneEngine] stopped")
    }
}
