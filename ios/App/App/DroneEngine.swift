import AVFoundation

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

/// Standalone reference-tone engine — decoupled from tuner UI.
/// Uses AVAudioEngine source nodes with 20 ms per-note crossfades.
final class DroneEngine {
    static let shared = DroneEngine()

    private let engine = AVAudioEngine()
    private let mainMixer = AVAudioMixerNode()
    private var voices: [Int: DroneVoice] = [:]
    private var octave = 4
    private var masterVolume: Float = 0.35
    private var waveform: DroneWaveform = .sine
    private var isRunning = false
    private var audioSessionPrepared = false
    private let stateLock = NSLock()

    private let fadeDuration: TimeInterval = 0.020
    private var outputFormat: AVAudioFormat?

    private init() {
        engine.attach(mainMixer)
        engine.connect(mainMixer, to: engine.outputNode, format: nil)
        outputFormat = engine.outputNode.inputFormat(forBus: 0)
        mainMixer.outputVolume = masterVolume
    }

    // MARK: - Public API

    func start() {
        stateLock.lock()
        defer { stateLock.unlock() }
        ensureEngineRunning()
    }

    func stop() {
        stateLock.lock()
        defer { stateLock.unlock() }

        for pitchClass in voices.keys {
            fadeVoice(pitchClass: pitchClass, to: 0)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + fadeDuration + 0.005) { [weak self] in
            guard let self = self else { return }
            self.stateLock.lock()
            defer { self.stateLock.unlock() }
            self.detachIdleVoices()
            if self.voices.isEmpty {
                self.stopEngineIfIdle()
            }
        }
    }

    @discardableResult
    func toggleNote(pitchClass: Int) -> Bool {
        guard (0...11).contains(pitchClass) else { return false }

        stateLock.lock()
        defer { stateLock.unlock() }

        if let voice = voices[pitchClass], voice.targetGain > 0.001 {
            fadeVoice(pitchClass: pitchClass, to: 0)
            scheduleDetachIfSilent(pitchClass: pitchClass)
            return false
        }

        attachVoiceIfNeeded(pitchClass: pitchClass)
        updateVoiceFrequency(pitchClass: pitchClass)
        fadeVoice(pitchClass: pitchClass, to: 1)
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
        guard !activePitchClasses.isEmpty else {
            octave = clamped
            stateLock.unlock()
            return
        }

        for pitchClass in activePitchClasses {
            fadeVoice(pitchClass: pitchClass, to: 0)
        }
        octave = clamped
        stateLock.unlock()

        DispatchQueue.main.asyncAfter(deadline: .now() + fadeDuration) { [weak self] in
            guard let self = self else { return }
            self.stateLock.lock()
            defer { self.stateLock.unlock() }
            for pitchClass in activePitchClasses {
                self.updateVoiceFrequency(pitchClass: pitchClass)
                self.fadeVoice(pitchClass: pitchClass, to: 1)
            }
            self.ensureEngineRunning()
        }
    }

    func setVolume(_ volume: Float) {
        stateLock.lock()
        masterVolume = max(0, min(1, volume))
        mainMixer.outputVolume = masterVolume
        stateLock.unlock()
    }

    func setWaveform(_ raw: String?) {
        stateLock.lock()
        waveform = DroneWaveform.parse(raw)
        stateLock.unlock()
    }

    func activeNotes() -> [Int] {
        stateLock.lock()
        defer { stateLock.unlock() }
        return voices
            .filter { $0.value.targetGain > 0.001 || $0.value.currentGain > 0.001 }
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
        return masterVolume
    }

    func currentWaveform() -> String {
        stateLock.lock()
        defer { stateLock.unlock() }
        return waveform.rawValue
    }

    func restoreState(activeNotes: [Int], octave: Int, volume: Float, waveform: String?) {
        stateLock.lock()
        self.octave = max(0, min(8, octave))
        masterVolume = max(0, min(1, volume))
        mainMixer.outputVolume = masterVolume
        self.waveform = DroneWaveform.parse(waveform)
        let notes = Set(activeNotes.filter { (0...11).contains($0) })
        stateLock.unlock()

        for pitchClass in notes {
            stateLock.lock()
            attachVoiceIfNeeded(pitchClass: pitchClass)
            updateVoiceFrequency(pitchClass: pitchClass)
            fadeVoice(pitchClass: pitchClass, to: 1)
            stateLock.unlock()
        }
        ensureEngineRunning()
    }

    // MARK: - Voice management

    private struct DroneVoice {
        let pitchClass: Int
        let sourceNode: AVAudioSourceNode
        var currentGain: Float = 0
        var targetGain: Float = 0
        var phase: Float = 0
        var frequency: Float = 440
        var isAttached = false
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

        prepareAudioSessionIfNeeded()
        let format = outputFormat ?? AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!

        let sourceNode = AVAudioSourceNode(format: format) { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            return self.render(pitchClass: pitchClass, frameCount: frameCount, audioBufferList: audioBufferList)
        }

        var voice = DroneVoice(pitchClass: pitchClass, sourceNode: sourceNode)
        voice.frequency = frequency(for: pitchClass)
        voices[pitchClass] = voice

        engine.attach(sourceNode)
        engine.connect(sourceNode, to: mainMixer, format: format)
        voices[pitchClass]?.isAttached = true
    }

    private func render(pitchClass: Int, frameCount: AVAudioFrameCount, audioBufferList: UnsafeMutablePointer<AudioBufferList>) -> OSStatus {
        stateLock.lock()
        guard var voice = voices[pitchClass] else {
            stateLock.unlock()
            return noErr
        }
        let wave = waveform
        let fadeStep = Float(1.0 / (fadeDuration * (outputFormat?.sampleRate ?? 44100)))
        stateLock.unlock()

        let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
        let channelCount = Int(ablPointer.count)
        let frames = Int(frameCount)
        let twoPi = Float.pi * 2

        for frame in 0..<frames {
            if voice.currentGain < voice.targetGain {
                voice.currentGain = min(voice.targetGain, voice.currentGain + fadeStep)
            } else if voice.currentGain > voice.targetGain {
                voice.currentGain = max(voice.targetGain, voice.currentGain - fadeStep)
            }

            let sample = Self.waveSample(phase: voice.phase, waveform: wave) * voice.currentGain
            voice.phase += twoPi * voice.frequency / Float(outputFormat?.sampleRate ?? 44100)
            if voice.phase > twoPi { voice.phase -= twoPi }

            for channel in 0..<channelCount {
                guard let buffer = ablPointer[channel].mData?.assumingMemoryBound(to: Float.self) else { continue }
                buffer[frame] = sample
            }
        }

        stateLock.lock()
        voices[pitchClass] = voice
        stateLock.unlock()
        return noErr
    }

    private static func waveSample(phase: Float, waveform: DroneWaveform) -> Float {
        switch waveform {
        case .sine:
            return sin(phase)
        case .triangle:
            let t = phase / (2 * Float.pi)
            let wrapped = t - floor(t)
            return 4 * abs(wrapped - 0.5) - 1
        case .organ:
            let s = sin(phase)
            return (s + 0.5 * sin(2 * phase) + 0.25 * sin(3 * phase)) / 1.75
        case .warmSynth:
            return sin(phase) * 0.72 + sin(2 * phase) * 0.18 + sin(3 * phase) * 0.10
        }
    }

    private func fadeVoice(pitchClass: Int, to target: Float) {
        guard var voice = voices[pitchClass] else { return }
        voice.targetGain = max(0, min(1, target))
        voices[pitchClass] = voice
    }

    private func updateVoiceFrequency(pitchClass: Int) {
        guard var voice = voices[pitchClass] else { return }
        voice.frequency = frequency(for: pitchClass)
        voices[pitchClass] = voice
    }

    private func scheduleDetachIfSilent(pitchClass: Int) {
        DispatchQueue.main.asyncAfter(deadline: .now() + fadeDuration + 0.005) { [weak self] in
            guard let self = self else { return }
            self.stateLock.lock()
            defer { self.stateLock.unlock() }
            guard let voice = self.voices[pitchClass], voice.currentGain <= 0.001, voice.targetGain <= 0.001 else {
                return
            }
            self.detachVoice(pitchClass: pitchClass)
            self.stopEngineIfIdle()
        }
    }

    private func detachIdleVoices() {
        for pitchClass in voices.keys {
            guard let voice = voices[pitchClass], voice.currentGain <= 0.001, voice.targetGain <= 0.001 else {
                continue
            }
            detachVoice(pitchClass: pitchClass)
        }
    }

    private func detachVoice(pitchClass: Int) {
        guard let voice = voices[pitchClass], voice.isAttached else {
            voices.removeValue(forKey: pitchClass)
            return
        }
        engine.disconnectNodeInput(voice.sourceNode)
        engine.disconnectNodeOutput(voice.sourceNode)
        engine.detach(voice.sourceNode)
        voices.removeValue(forKey: pitchClass)
    }

    private func ensureEngineRunning() {
        guard !isRunning else { return }
        do {
            prepareAudioSessionIfNeeded()
            if !engine.isRunning {
                try engine.start()
            }
            isRunning = true
        } catch {
            print("[DroneEngine] failed to start: \(error.localizedDescription)")
        }
    }

    private func prepareAudioSessionIfNeeded() {
        guard !audioSessionPrepared else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            let options: AVAudioSession.CategoryOptions = [
                .mixWithOthers,
                .allowBluetoothA2DP,
                .defaultToSpeaker,
            ]
            try AudioRouteConfigurator.debugSetCategory(
                session,
                category: .playAndRecord,
                mode: .default,
                options: options,
                caller: "DroneEngine.prepareAudioSession"
            )
            try session.setPreferredSampleRate(48000)
            try session.setPreferredIOBufferDuration(0.005)
            try AudioRouteConfigurator.debugSetActive(
                session,
                active: true,
                caller: "DroneEngine.prepareAudioSession"
            )
            outputFormat = engine.outputNode.inputFormat(forBus: 0)
            audioSessionPrepared = true
            print("[DroneEngine] prepared audio session route=\(AudioRouteConfigurator.routeSnapshot())")
        } catch {
            print("[DroneEngine] audio session prepare failed: \(error.localizedDescription)")
        }
    }

    private func stopEngineIfIdle() {
        let hasAudibleVoice = voices.contains { $0.value.currentGain > 0.001 || $0.value.targetGain > 0.001 }
        guard !hasAudibleVoice else { return }
        engine.stop()
        isRunning = false
    }
}
