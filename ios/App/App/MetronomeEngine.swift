import AVFoundation
import Foundation

enum MetronomeClickTier: String {
    case downbeat
    case macro
    case subdivision
}

enum MetronomeSoundId: String {
    case classic
    case woodblock
    case soft
    case electronic

    static func parse(_ raw: String?) -> MetronomeSoundId {
        guard let raw = raw, let value = MetronomeSoundId(rawValue: raw) else {
            return .classic
        }
        return value
    }
}

struct MetronomeClickProfile {
    let hz: Float
    let peak: Float
    let decaySec: Float
    let wave: MetronomeWaveform
}

enum MetronomeWaveform {
    case sine
    case triangle
    case square
}

/// Native metronome — direct AVAudioEngine path with speaker bus gain + hard clip
/// (matches Web Audio metronome: ~48× GainNode into destination, no dynamics on bursts).
final class MetronomeEngine {
    static let shared = MetronomeEngine()

    typealias PulseHandler = (_ beatIndex: Int, _ subTickIndex: Int, _ beatPulseId: Int) -> Void
    typealias BarHandler = () -> Void

    private let engine = AVAudioEngine()
    private let outputMixer = AVAudioMixerNode()
    private let renderFormat = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
    private lazy var sourceNode = AVAudioSourceNode(format: renderFormat) { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
        guard let self = self else { return noErr }
        return self.render(frameCount: frameCount, audioBufferList: audioBufferList)
    }

    private let stateLock = NSLock()
    private let schedulerQueue = DispatchQueue(label: "MetronomeEngine.scheduler", qos: .userInteractive)

    private var isRunning = false
    private var muted = false
    private var soundId: MetronomeSoundId = .classic

    private var tierPattern: [MetronomeClickTier?] = []
    private var ticksPerBar = 4
    private var pulseTicks = 1
    private var framesPerTick: Int64 = 48_000
    private var tickCounter = 0
    private var beatPulseId = 0

    private var globalSampleIndex: Int64 = 0
    private var nextTickSample: Int64 = 0
    private var schedulerTimer: DispatchSourceTimer?

    private var activeClicks: [ClickVoice] = []
    private var pendingClicks: [PendingClick] = []

    private var pulseHandler: PulseHandler?
    private var barHandler: BarHandler?

    private var firstClickPerfMs: Double = 0
    private var firstClickHostTimeSec: Double = 0

    private let scheduleAheadFrames: Int64 = 5_760 // 0.12 s @ 48 kHz
    /// Matches native Web Audio speaker bus (`PLAYBACK_GAIN_NATIVE` / phone preset audit).
    private let speakerBusGain: Float = 48

    private var configurationObserver: NSObjectProtocol?

    private init() {
        configurationObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange,
            object: engine,
            queue: .main
        ) { [weak self] _ in
            self?.handleEngineConfigurationChange()
        }

        engine.attach(outputMixer)
        engine.attach(sourceNode)
        engine.connect(sourceNode, to: outputMixer, format: renderFormat)
        engine.connect(outputMixer, to: engine.outputNode, format: nil)
        outputMixer.outputVolume = 1
    }

    deinit {
        if let configurationObserver = configurationObserver {
            NotificationCenter.default.removeObserver(configurationObserver)
        }
    }

    // MARK: - Public API

    func setEventHandlers(pulse: PulseHandler?, bar: BarHandler?) {
        stateLock.lock()
        pulseHandler = pulse
        barHandler = bar
        stateLock.unlock()
    }

    @discardableResult
    func start(
        tierPattern: [MetronomeClickTier?],
        ticksPerBar: Int,
        pulseTicks: Int,
        secondsPerTick: Double,
        soundId: String,
        muted: Bool,
        leadSec: Double
    ) throws -> [String: Any] {
        stopSchedulerOnly()

        let sampleRate = renderFormat.sampleRate
        guard sampleRate > 0, ticksPerBar > 0, pulseTicks > 0, secondsPerTick > 0 else {
            throw NSError(domain: "MetronomeEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid metronome timing"])
        }

        let framesPerTickValue = max(1, Int64((secondsPerTick * sampleRate).rounded()))
        let leadFrames = max(0, Int64((leadSec * sampleRate).rounded()))

        stateLock.lock()
        self.tierPattern = tierPattern
        self.ticksPerBar = ticksPerBar
        self.pulseTicks = max(1, pulseTicks)
        self.framesPerTick = framesPerTickValue
        self.soundId = MetronomeSoundId.parse(soundId)
        self.muted = muted
        self.tickCounter = 0
        self.beatPulseId = 0
        self.globalSampleIndex = 0
        self.nextTickSample = leadFrames
        self.activeClicks.removeAll()
        self.pendingClicks.removeAll()
        self.firstClickHostTimeSec = leadSec
        self.firstClickPerfMs = Date().timeIntervalSince1970 * 1000 + leadSec * 1000
        stateLock.unlock()

        try preparePlaybackSession()
        try ensureEngineRunning()

        startScheduler()

        print(
            "[MetronomeEngine] started ticksPerBar=\(ticksPerBar) pulseTicks=\(pulseTicks) " +
            "secondsPerTick=\(secondsPerTick) leadSec=\(leadSec) sound=\(soundId) muted=\(muted) " +
            "speakerBusGain=\(speakerBusGain) path=direct"
        )

        return [
            "playing": true,
            "firstClickPerfMs": firstClickPerfMs,
            "firstClickHostTimeSec": firstClickHostTimeSec,
            "sampleRate": sampleRate,
        ]
    }

    func stop() {
        stopSchedulerOnly()
        stopEngine()
        print("[MetronomeEngine] stopped")
    }

    func setMuted(_ muted: Bool) {
        stateLock.lock()
        self.muted = muted
        if muted {
            activeClicks.removeAll()
            pendingClicks.removeAll()
        }
        stateLock.unlock()
    }

    func updateTiming(
        tierPattern: [MetronomeClickTier?],
        ticksPerBar: Int,
        pulseTicks: Int,
        secondsPerTick: Double,
        soundId: String
    ) {
        let sampleRate = renderFormat.sampleRate
        let framesPerTickValue = max(1, Int64((secondsPerTick * sampleRate).rounded()))

        stateLock.lock()
        self.tierPattern = tierPattern
        self.ticksPerBar = max(1, ticksPerBar)
        self.pulseTicks = max(1, pulseTicks)
        self.framesPerTick = framesPerTickValue
        self.soundId = MetronomeSoundId.parse(soundId)
        stateLock.unlock()
    }

    func isPlaying() -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return schedulerTimer != nil
    }

    /// Pause AVAudioEngine output while AVCaptureSession configures — avoids black preview.
    func pauseOutputForCaptureHandoff() {
        if engine.isRunning {
            engine.stop()
        }
        isRunning = false
    }

    /// Resume after camera bridge owns the session (scheduler keeps running).
    func resumeOutputAfterCaptureHandoff() {
        guard schedulerTimer != nil else { return }
        do {
            try preparePlaybackSession()
            try ensureEngineRunning()
        } catch {
            print("[MetronomeEngine] resume after capture handoff failed: \(error.localizedDescription)")
        }
    }

    // MARK: - Audio graph

    private func handleEngineConfigurationChange() {
        isRunning = false
        guard schedulerTimer != nil else { return }
        do {
            try preparePlaybackSession()
            try ensureEngineRunning()
            print("[MetronomeEngine] restarted after configuration change")
        } catch {
            print("[MetronomeEngine] configuration change restart failed: \(error.localizedDescription)")
        }
    }

    private func ensureEngineRunning() throws {
        if isRunning, engine.isRunning { return }
        outputMixer.outputVolume = 1
        engine.prepare()
        try engine.start()
        isRunning = true
    }

    private func stopEngine() {
        if engine.isRunning {
            engine.stop()
        }
        isRunning = false
        stateLock.lock()
        activeClicks.removeAll()
        pendingClicks.removeAll()
        stateLock.unlock()
    }

    private func preparePlaybackSession() throws {
        try AudioRouteConfigurator.prepareMetronomePlaybackSessionIfNeeded()
    }

    // MARK: - Scheduler

    private func startScheduler() {
        let timer = DispatchSource.makeTimerSource(queue: schedulerQueue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(25), leeway: .milliseconds(4))
        timer.setEventHandler { [weak self] in
            self?.scheduleAhead()
        }
        timer.resume()
        schedulerTimer = timer
    }

    private func stopSchedulerOnly() {
        schedulerTimer?.cancel()
        schedulerTimer = nil
    }

    private func scheduleAhead() {
        stateLock.lock()
        let currentSample = globalSampleIndex
        let pattern = tierPattern
        let barTicks = ticksPerBar
        let pulseTickCount = pulseTicks
        let perTick = framesPerTick
        let sound = soundId
        let isMuted = muted
        var nextSample = nextTickSample
        var counter = tickCounter
        var pulseId = beatPulseId
        let pulseCount = max(1, barTicks / max(1, pulseTickCount))
        stateLock.unlock()

        guard !pattern.isEmpty, barTicks > 0 else { return }

        while nextSample < currentSample + scheduleAheadFrames {
            let tickInBar = counter % barTicks
            let tier = pattern[tickInBar]
            if let tier = tier, !isMuted {
                enqueueClick(at: nextSample, tier: tier, sound: sound)
            }

            if nextSample - currentSample <= scheduleAheadFrames {
                let beatIndex = (tickInBar / pulseTickCount) % pulseCount
                let subTickIndex = tickInBar % pulseTickCount
                if subTickIndex == 0 {
                    pulseId += 1
                    let handler = pulseHandler
                    let capturedBeat = beatIndex
                    let capturedSub = subTickIndex
                    let capturedPulseId = pulseId
                    DispatchQueue.main.async {
                        handler?(capturedBeat, capturedSub, capturedPulseId)
                    }
                }
            }

            counter += 1
            if counter > 0 && counter % barTicks == 0 {
                let handler = barHandler
                DispatchQueue.main.async {
                    handler?()
                }
            }

            nextSample += perTick
        }

        stateLock.lock()
        nextTickSample = nextSample
        tickCounter = counter
        beatPulseId = pulseId
        stateLock.unlock()
    }

    // MARK: - Click synthesis

    private struct PendingClick {
        let startSample: Int64
        let tier: MetronomeClickTier
        let sound: MetronomeSoundId
    }

    private struct ClickVoice {
        var elapsed: Int = 0
        var totalSamples: Int
        var attackSamples: Int
        var phase: Float = 0
        var hz: Float
        var peak: Float
        var wave: MetronomeWaveform
    }

    private func enqueueClick(at sample: Int64, tier: MetronomeClickTier, sound: MetronomeSoundId) {
        stateLock.lock()
        pendingClicks.append(PendingClick(startSample: sample, tier: tier, sound: sound))
        stateLock.unlock()
    }

    private func profile(for tier: MetronomeClickTier, sound: MetronomeSoundId) -> MetronomeClickProfile {
        switch sound {
        case .woodblock:
            switch tier {
            case .downbeat: return MetronomeClickProfile(hz: 320, peak: 0.95, decaySec: 0.032, wave: .triangle)
            case .macro: return MetronomeClickProfile(hz: 260, peak: 0.55, decaySec: 0.028, wave: .triangle)
            case .subdivision: return MetronomeClickProfile(hz: 220, peak: 0.18, decaySec: 0.022, wave: .triangle)
            }
        case .soft:
            switch tier {
            case .downbeat: return MetronomeClickProfile(hz: 660, peak: 0.34, decaySec: 0.085, wave: .sine)
            case .macro: return MetronomeClickProfile(hz: 540, peak: 0.22, decaySec: 0.072, wave: .sine)
            case .subdivision: return MetronomeClickProfile(hz: 440, peak: 0.08, decaySec: 0.052, wave: .sine)
            }
        case .electronic:
            switch tier {
            case .downbeat: return MetronomeClickProfile(hz: 1800, peak: 0.9, decaySec: 0.03, wave: .square)
            case .macro: return MetronomeClickProfile(hz: 1500, peak: 0.5, decaySec: 0.026, wave: .square)
            case .subdivision: return MetronomeClickProfile(hz: 1300, peak: 0.22, decaySec: 0.02, wave: .square)
            }
        case .classic:
            switch tier {
            case .downbeat: return MetronomeClickProfile(hz: 1000, peak: 1.0, decaySec: 0.045, wave: .sine)
            case .macro: return MetronomeClickProfile(hz: 800, peak: 0.75, decaySec: 0.045, wave: .sine)
            case .subdivision: return MetronomeClickProfile(hz: 600, peak: 0.35, decaySec: 0.028, wave: .sine)
            }
        }
    }

    private func render(frameCount: AVAudioFrameCount, audioBufferList: UnsafeMutablePointer<AudioBufferList>) -> OSStatus {
        let frames = Int(frameCount)
        let sampleRate = Float(renderFormat.sampleRate)
        let twoPi = Float.pi * 2

        stateLock.lock()
        var clicks = activeClicks
        let pendingSnapshot = pendingClicks
        pendingClicks = []
        let bufferStart = globalSampleIndex
        globalSampleIndex += Int64(frames)
        stateLock.unlock()

        var pending = pendingSnapshot

        let ablPointer = UnsafeMutableAudioBufferListPointer(audioBufferList)
        let channelCount = ablPointer.count

        for frame in 0..<frames {
            let absoluteSample = bufferStart + Int64(frame)

            var stillPending: [PendingClick] = []
            for item in pending {
                if item.startSample == absoluteSample {
                    clicks.append(makeVoice(for: item, sound: item.sound))
                } else if item.startSample > absoluteSample {
                    stillPending.append(item)
                } else {
                    clicks.append(makeVoice(for: item, sound: item.sound))
                }
            }
            pending = stillPending

            var mixed: Float = 0
            var nextClicks: [ClickVoice] = []

            for var voice in clicks {
                let gain: Float
                if voice.elapsed < voice.attackSamples {
                    let t = Float(voice.elapsed + 1) / Float(max(1, voice.attackSamples))
                    gain = max(0.0001, voice.peak * t)
                } else {
                    let decayPos = Float(voice.elapsed - voice.attackSamples)
                    let decayLen = Float(max(1, voice.totalSamples - voice.attackSamples))
                    let envelope = expf(-5 * decayPos / decayLen)
                    gain = max(0.0001, voice.peak * envelope)
                }

                mixed += waveSample(phase: voice.phase, wave: voice.wave) * gain

                voice.phase += twoPi * voice.hz / sampleRate
                if voice.phase > twoPi { voice.phase -= twoPi }
                voice.elapsed += 1
                if voice.elapsed < voice.totalSamples {
                    nextClicks.append(voice)
                }
            }
            clicks = nextClicks

            let sample = speakerClip(mixed * speakerBusGain)
            for channel in 0..<channelCount {
                guard let buffer = ablPointer[channel].mData?.assumingMemoryBound(to: Float.self) else { continue }
                buffer[frame] = sample
            }
        }

        stateLock.lock()
        activeClicks = clicks
        pendingClicks.append(contentsOf: pending)
        stateLock.unlock()
        return noErr
    }

    private func makeVoice(for click: PendingClick, sound: MetronomeSoundId) -> ClickVoice {
        let profile = profile(for: click.tier, sound: sound)
        let sampleRate = Float(renderFormat.sampleRate)
        let attackSamples = max(1, Int((0.0015 * Double(sampleRate)).rounded()))
        let totalSamples = max(attackSamples + 1, Int((Double(profile.decaySec) * Double(sampleRate)).rounded()))
        return ClickVoice(
            totalSamples: totalSamples,
            attackSamples: attackSamples,
            hz: profile.hz,
            peak: profile.peak,
            wave: profile.wave
        )
    }

    private func waveSample(phase: Float, wave: MetronomeWaveform) -> Float {
        switch wave {
        case .sine:
            return sin(phase)
        case .triangle:
            let t = phase / (2 * Float.pi)
            let wrapped = t - floor(t)
            return 4 * abs(wrapped - 0.5) - 1
        case .square:
            return sin(phase) >= 0 ? 1 : -1
        }
    }

    /// Hard clip at the bus output — same speaker-loudness trick as Web Audio destination clipping.
    private func speakerClip(_ value: Float) -> Float {
        if value > 0.98 { return 0.98 }
        if value < -0.98 { return -0.98 }
        return value
    }
}
