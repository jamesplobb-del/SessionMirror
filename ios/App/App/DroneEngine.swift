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
    private var octave = 4
    private var requestedVolume: Float = 0.75
    private var masterVolume: Float = DroneEngine.outputVolume(for: 0.75)
    private var waveform: DroneWaveform = .sine
    private var isRunning = false
    private var audioSessionPrepared = false
    private var configurationObserver: NSObjectProtocol?
    private let stateLock = NSLock()

    private let fadeDuration: TimeInterval = 0.035
    private let oscillatorHeadroom: Float = 0.62

    private init() {
        engine.attach(mainMixer)
        engine.attach(sourceNode)
        engine.connect(sourceNode, to: mainMixer, format: renderFormat)
        engine.connect(mainMixer, to: engine.outputNode, format: nil)
        mainMixer.outputVolume = masterVolume

        configurationObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: .main
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

        DispatchQueue.main.asyncAfter(deadline: .now() + fadeDuration + 0.02) { [weak self] in
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
        mainMixer.outputVolume = masterVolume
        self.waveform = DroneWaveform.parse(waveform)
        let notes = Set(activeNotes.filter { (0...11).contains($0) })
        for pitchClass in notes {
            attachVoiceIfNeeded(pitchClass: pitchClass)
            updateVoiceFrequency(pitchClass: pitchClass)
            fadeVoice(pitchClass: pitchClass, to: 1)
        }
        stateLock.unlock()
        ensureEngineRunning()
    }

    // MARK: - Voice management

    private struct DroneVoice {
        let pitchClass: Int
        var currentGain: Float = 0
        var targetGain: Float = 0
        var phase: Float = 0
        var frequency: Float = 440
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
        voices[pitchClass] = voice
    }

    private func render(frameCount: AVAudioFrameCount, audioBufferList: UnsafeMutablePointer<AudioBufferList>) -> OSStatus {
        stateLock.lock()
        var renderVoices = voices
        let wave = waveform
        let activeCount = max(
            1,
            renderVoices.values.filter { $0.targetGain > 0.001 || $0.currentGain > 0.001 }.count
        )
        stateLock.unlock()

        let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
        let channelCount = Int(ablPointer.count)
        let frames = Int(frameCount)
        let twoPi = Float.pi * 2
        let sampleRate = Float(renderFormat.sampleRate)
        let fadeStep = Float(1.0 / (fadeDuration * renderFormat.sampleRate))
        let chordNormalization = min(1, 0.82 / sqrt(Float(activeCount)))

        for frame in 0..<frames {
            var mixed: Float = 0

            for pitchClass in renderVoices.keys {
                guard var voice = renderVoices[pitchClass] else { continue }

                if voice.currentGain < voice.targetGain {
                    voice.currentGain = min(voice.targetGain, voice.currentGain + fadeStep)
                } else if voice.currentGain > voice.targetGain {
                    voice.currentGain = max(voice.targetGain, voice.currentGain - fadeStep)
                }

                mixed += Self.waveSample(phase: voice.phase, waveform: wave) * voice.currentGain
                voice.phase += twoPi * voice.frequency / sampleRate
                if voice.phase > twoPi { voice.phase -= twoPi }
                renderVoices[pitchClass] = voice
            }

            let sample = Self.cleanLimit(mixed * chordNormalization * oscillatorHeadroom)
            for channel in 0..<channelCount {
                guard let buffer = ablPointer[channel].mData?.assumingMemoryBound(to: Float.self) else { continue }
                buffer[frame] = sample
            }
        }

        stateLock.lock()
        for (pitchClass, renderedVoice) in renderVoices {
            guard var liveVoice = voices[pitchClass] else { continue }
            liveVoice.phase = renderedVoice.phase
            liveVoice.currentGain = renderedVoice.currentGain
            voices[pitchClass] = liveVoice
        }
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

    private static func cleanLimit(_ value: Float) -> Float {
        return max(-0.98, min(0.98, value))
    }

    private static func outputVolume(for requestedVolume: Float) -> Float {
        let clamped = max(0, min(1, requestedVolume))
        if clamped <= 0 { return 0 }
        return min(1, 0.08 + pow(clamped, 0.7) * 0.92)
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
        DispatchQueue.main.asyncAfter(deadline: .now() + fadeDuration + 0.04) { [weak self] in
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
        stateLock.lock()
        if isRunning && engine.isRunning {
            stateLock.unlock()
            return
        }
        isRunning = false
        stateLock.unlock()

        do {
            prepareAudioSessionIfNeeded()
            if !engine.isRunning {
                engine.prepare()
                try engine.start()
            }
            stateLock.lock()
            isRunning = true
            let activeNotes = voices.keys.sorted()
            stateLock.unlock()
            print("[DroneEngine] started activeNotes=\(activeNotes) requestedVolume=\(requestedVolume) outputVolume=\(masterVolume)")
        } catch {
            stateLock.lock()
            isRunning = false
            stateLock.unlock()
            print("[DroneEngine] failed to start: \(error.localizedDescription)")
            engine.reset()
        }
    }

    private func prepareAudioSessionIfNeeded() {
        guard !audioSessionPrepared else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            let options: AVAudioSession.CategoryOptions = [
                .allowBluetoothA2DP,
                .allowAirPlay,
                .defaultToSpeaker,
            ]
            try AudioRouteConfigurator.debugSetCategory(
                session,
                category: .playAndRecord,
                mode: .default,
                options: options,
                caller: "DroneEngine.prepareAudioSession"
            )
            try session.setPreferredSampleRate(48_000)
            try session.setPreferredIOBufferDuration(0.005)
            try AudioRouteConfigurator.debugSetActive(
                session,
                active: true,
                caller: "DroneEngine.prepareAudioSession"
            )
            audioSessionPrepared = true
            print("[DroneEngine] prepared audio session route=\(AudioRouteConfigurator.routeSnapshot())")
        } catch {
            print("[DroneEngine] audio session prepare failed: \(error.localizedDescription)")
        }
    }

    private func handleEngineConfigurationChange() {
        stateLock.lock()
        isRunning = false
        audioSessionPrepared = false
        stateLock.unlock()
        print("[DroneEngine] configuration changed; will restart on next note")
    }

    private func stopEngineIfIdle() {
        stateLock.lock()
        let hasAudibleVoice = voices.contains { $0.value.currentGain > 0.001 || $0.value.targetGain > 0.001 }
        if hasAudibleVoice {
            stateLock.unlock()
            return
        }
        isRunning = false
        stateLock.unlock()
        engine.stop()
        print("[DroneEngine] stopped")
    }
}
