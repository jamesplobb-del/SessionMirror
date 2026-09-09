import Foundation
import AVFoundation
enum Before {
struct LevelMeasurement { let peakDb:Double; let rmsDb:Double; let activeRmsDb:Double }
    static func measureLevels(fileURL: URL, maxSeconds: Double = 45) -> LevelMeasurement? {
        let asset = AVURLAsset(url: fileURL)
        guard let track = asset.tracks(withMediaType: .audio).first else { return nil }

        guard let reader = try? AVAssetReader(asset: asset) else { return nil }
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsNonInterleaved: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        guard reader.canAdd(output) else { return nil }
        reader.add(output)
        guard reader.startReading() else { return nil }

        let maxSamples = Int(maxSeconds * 48_000)
        var peak: Float = 0
        var sumSq: Double = 0
        var sampleCount = 0

        while reader.status == .reading, sampleCount < maxSamples {
            guard let sampleBuffer = output.copyNextSampleBuffer(),
                  let block = CMSampleBufferGetDataBuffer(sampleBuffer) else { break }

            var length = 0
            var dataPointer: UnsafeMutablePointer<Int8>?
            guard CMBlockBufferGetDataPointer(
                block,
                atOffset: 0,
                lengthAtOffsetOut: nil,
                totalLengthOut: &length,
                dataPointerOut: &dataPointer
            ) == kCMBlockBufferNoErr, let dataPointer = dataPointer else { continue }

            let floatCount = length / MemoryLayout<Float>.size
            dataPointer.withMemoryRebound(to: Float.self, capacity: floatCount) { floats in
                for i in 0..<floatCount {
                    let sample = floats[i]
                    let abs = fabsf(sample)
                    if abs > peak { peak = abs }
                    sumSq += Double(sample * sample)
                    sampleCount += 1
                }
            }
        }

        guard sampleCount > 0 else { return nil }

        let rms = sqrt(sumSq / Double(sampleCount))
        let activeRms = measureActiveRms(fileURL: fileURL, gateRatio: 0.12, peak: Double(peak), maxSeconds: maxSeconds)
            ?? rms

        return LevelMeasurement(
            peakDb: linearToDb(Double(peak)),
            rmsDb: linearToDb(rms),
            activeRmsDb: linearToDb(activeRms)
        )
    }

    private static func measureActiveRms(
        fileURL: URL,
        gateRatio: Double,
        peak: Double,
        maxSeconds: Double
    ) -> Double? {
        let gate = max(peak * gateRatio, 1e-8)
        let asset = AVURLAsset(url: fileURL)
        guard let track = asset.tracks(withMediaType: .audio).first else { return nil }

        guard let reader = try? AVAssetReader(asset: asset) else { return nil }
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsNonInterleaved: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        guard reader.canAdd(output) else { return nil }
        reader.add(output)
        guard reader.startReading() else { return nil }

        let maxSamples = Int(maxSeconds * 48_000)
        var activeSumSq: Double = 0
        var activeCount = 0
        var sampleCount = 0

        while reader.status == .reading, sampleCount < maxSamples {
            guard let sampleBuffer = output.copyNextSampleBuffer(),
                  let block = CMSampleBufferGetDataBuffer(sampleBuffer) else { break }

            var length = 0
            var dataPointer: UnsafeMutablePointer<Int8>?
            guard CMBlockBufferGetDataPointer(
                block,
                atOffset: 0,
                lengthAtOffsetOut: nil,
                totalLengthOut: &length,
                dataPointerOut: &dataPointer
            ) == kCMBlockBufferNoErr, let dataPointer = dataPointer else { continue }

            let floatCount = length / MemoryLayout<Float>.size
            dataPointer.withMemoryRebound(to: Float.self, capacity: floatCount) { floats in
                for i in 0..<floatCount {
                    let sample = Double(floats[i])
                    if abs(sample) >= gate {
                        activeSumSq += sample * sample
                        activeCount += 1
                    }
                    sampleCount += 1
                }
            }
        }

        guard activeCount > 0 else { return nil }
        return sqrt(activeSumSq / Double(activeCount))
    }


static func linearToDb(_ value:Double)->Double {20 * log10(max(value,1e-8))}
}
