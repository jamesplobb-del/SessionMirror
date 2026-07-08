import AVFoundation

enum NativeAudioDecoderError: Error {
    case noAudioTrack
    case readerStartFailed
}

/// Read mono linear PCM from a local media file (no temp export).
enum NativeAudioDecoder {
    static func readMonoPCM(url: URL) throws -> (samples: [Float], sampleRate: Double) {
        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .audio).first else {
            throw NativeAudioDecoderError.noAudioTrack
        }

        let reader = try AVAssetReader(asset: asset)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVNumberOfChannelsKey: 1,
            AVSampleRateKey: 44_100,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        reader.add(output)
        guard reader.startReading() else {
            throw NativeAudioDecoderError.readerStartFailed
        }

        var samples: [Float] = []
        samples.reserveCapacity(44_100 * 30)
        var sampleRate = 44_100.0

        while reader.status == .reading {
            guard let sampleBuffer = output.copyNextSampleBuffer() else { break }
            if let formatDesc = CMSampleBufferGetFormatDescription(sampleBuffer),
               let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)?.pointee,
               asbd.mSampleRate > 0 {
                sampleRate = asbd.mSampleRate
            }

            guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }
            let length = CMBlockBufferGetDataLength(blockBuffer)
            var data = Data(count: length)
            let copyStatus = data.withUnsafeMutableBytes { ptr -> OSStatus in
                guard let base = ptr.baseAddress else { return -1 }
                return CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: base)
            }
            guard copyStatus == noErr else { continue }

            data.withUnsafeBytes { raw in
                let int16 = raw.bindMemory(to: Int16.self)
                for i in 0..<int16.count {
                    samples.append(Float(int16[i]) / 32_768.0)
                }
            }
        }

        return (samples, sampleRate)
    }
}
