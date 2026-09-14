import UIKit
import AVFoundation
import PDFKit
typealias JSObject = [String:Any]
class CAPPluginCall {
 let data:JSObject;let completion:(Result<JSObject,Error>)->Void
 init(_ data:JSObject,_ completion:@escaping(Result<JSObject,Error>)->Void){self.data=data;self.completion=completion}
 func getString(_ k:String)->String?{data[k] as? String}
 func getDouble(_ k:String)->Double?{(data[k] as? NSNumber)?.doubleValue}
 func getArray<T>(_ k:String,_ t:T.Type)->[T]?{data[k] as? [T]}
 func getObject(_ k:String)->JSObject?{data[k] as? JSObject}
 func resolve(_ d:JSObject){completion(.success(d))}
 func reject(_ message:String,_ code:String?=nil,_ error:Error?=nil){completion(.failure(error ?? NSError(domain:message,code:1)))}
}
class Renderer {
    private func fileURL(from path: String?) -> URL? {
        guard let path = path, !path.isEmpty else { return nil }
        if let url = URL(string: path), url.isFileURL {
            return url
        }
        return URL(fileURLWithPath: path)
    }
    private func creatorStudioRenderSize(for aspectRatio: String) -> CGSize {
        switch aspectRatio {
        case "1:1":
            return CGSize(width: 1080, height: 1080)
        case "16:9":
            return CGSize(width: 1920, height: 1080)
        default:
            return CGSize(width: 1080, height: 1920)
        }
    }
    private func percentValue(_ value: Any?, fallback: CGFloat) -> CGFloat {
        if let value = value as? Double { return CGFloat(value) }
        if let value = value as? NSNumber { return CGFloat(truncating: value) }
        return fallback
    }
    private func imageForCreatorStudioAsset(path: String, fileType: String) -> UIImage? {
        guard let url = fileURL(from: path) else { return nil }
        if fileType == "pdf" {
            guard let document = PDFDocument(url: url), let page = document.page(at: 0) else {
                return nil
            }
            let bounds = page.bounds(for: .mediaBox)
            let scale: CGFloat = 2
            let size = CGSize(width: bounds.width * scale, height: bounds.height * scale)
            let renderer = UIGraphicsImageRenderer(size: size)
            return renderer.image { context in
                UIColor.white.set()
                context.fill(CGRect(origin: .zero, size: size))
                context.cgContext.saveGState()
                context.cgContext.translateBy(x: 0, y: size.height)
                context.cgContext.scaleBy(x: scale, y: -scale)
                page.draw(with: .mediaBox, to: context.cgContext)
                context.cgContext.restoreGState()
            }
        }
        return UIImage(contentsOfFile: url.path)
    }
    private func normalizedTrackOrientation(_ track: AVAssetTrack) -> (transform: CGAffineTransform, orientedSize: CGSize) {
        let preferred = track.preferredTransform
        let naturalRect = CGRect(origin: .zero, size: track.naturalSize).applying(preferred)
        let orientedSize = CGSize(width: abs(naturalRect.width), height: abs(naturalRect.height))
        let normalize = preferred.concatenating(
            CGAffineTransform(translationX: -naturalRect.origin.x, y: -naturalRect.origin.y)
        )
        return (normalize, orientedSize)
    }
    private func multitrackRectFrame(_ rectDict: [String: Any], renderSize: CGSize) -> CGRect {
        let xPercent = percentValue(rectDict["xPercent"], fallback: 0) / 100
        let yPercent = percentValue(rectDict["yPercent"], fallback: 0) / 100
        let widthPercent = percentValue(rectDict["widthPercent"], fallback: 100) / 100
        let heightPercent = percentValue(rectDict["heightPercent"], fallback: 100) / 100
        // Round shared boundaries, not widths independently. Adjacent cells now
        // land on the exact same output pixel and cannot expose a black seam.
        let minX = round(xPercent * renderSize.width)
        let minY = round(yPercent * renderSize.height)
        let maxX = round((xPercent + widthPercent) * renderSize.width)
        let maxY = round((yPercent + heightPercent) * renderSize.height)
        return CGRect(
            x: minX,
            y: minY,
            width: max(1, maxX - minX),
            height: max(1, maxY - minY)
        )
    }
    private func multitrackVideoGeometry(
        track: AVAssetTrack,
        targetRect: CGRect
    ) -> (transform: CGAffineTransform, cropRect: CGRect) {
        let (normalize, orientedSize) = normalizedTrackOrientation(track)
        let sourceAspect = orientedSize.width / max(orientedSize.height, 1)
        let targetAspect = targetRect.width / max(targetRect.height, 1)
        let cropSize: CGSize
        if sourceAspect > targetAspect {
            cropSize = CGSize(width: orientedSize.height * targetAspect, height: orientedSize.height)
        } else {
            cropSize = CGSize(width: orientedSize.width, height: orientedSize.width / max(targetAspect, 0.0001))
        }
        let orientedCrop = CGRect(
            x: (orientedSize.width - cropSize.width) / 2,
            y: (orientedSize.height - cropSize.height) / 2,
            width: cropSize.width,
            height: cropSize.height
        )
        let naturalCrop = orientedCrop.applying(normalize.inverted()).standardized
        let scale = max(
            targetRect.width / max(orientedCrop.width, 1),
            targetRect.height / max(orientedCrop.height, 1)
        )
        let transform = normalize
            .concatenating(CGAffineTransform(
                translationX: -orientedCrop.origin.x,
                y: -orientedCrop.origin.y
            ))
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(
                translationX: targetRect.origin.x,
                y: targetRect.origin.y
            ))
        return (transform, naturalCrop)
    }
    func renderMultitrackVideo(_ call: CAPPluginCall) {
        let aspectRatio = call.getString("aspectRatio") ?? "9:16"
        let renderSize = creatorStudioRenderSize(for: aspectRatio)
        let durationHint = call.getDouble("durationSeconds") ?? 0
        let sources = call.getArray("sources", JSObject.self) ?? []

        guard !sources.isEmpty else {
            call.reject("No performance videos to export")
            return
        }

        let composition = AVMutableComposition()
        var layerInstructions: [AVMutableVideoCompositionLayerInstruction] = []
        var audioParameters: [AVMutableAudioMixInputParameters] = []
        var longestDuration = CMTime.zero

        for sourceAny in sources {
            let source = sourceAny as [String: Any]
            guard
                let path = source["path"] as? String,
                let sourceURL = fileURL(from: path),
                let rectDict = source["rect"] as? [String: Any]
            else { continue }

            let asset = AVURLAsset(url: sourceURL)
            guard let videoTrack = asset.tracks(withMediaType: .video).first else {
                call.reject("A panel video could not be read. Relink the missing take and retry.")
                return
            }

            guard let compositionVideo = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid
            ) else { continue }

            // Per-source trim: timeline 0 maps to trimStartSec inside the take,
            // and trimEndSec (if set) caps its contribution.
            let trimStartSec = (source["trimStartSec"] as? NSNumber)?.doubleValue ?? 0
            let trimEndSec = (source["trimEndSec"] as? NSNumber)?.doubleValue
            let timelineOffsetMs = (source["timelineOffsetMs"] as? NSNumber)?.doubleValue ?? 0
            
            // Must match live playback semantics (useMultitrackSync):
            // media time = timeline + trimStart + offset. Positive offset skips
            // the take's head (content plays earlier); negative offset delays
            // the clip's entry onto the timeline.
            var offsetInsertTime = CMTime.zero
            var adjustedTrimStart = trimStartSec
            if timelineOffsetMs > 0 {
                adjustedTrimStart += timelineOffsetMs / 1000.0
            } else if timelineOffsetMs < 0 {
                offsetInsertTime = CMTime(value: Int64(-timelineOffsetMs), timescale: 1000)
            }
            
            let assetSeconds = CMTimeGetSeconds(asset.duration)
            let clampedEnd = min(trimEndSec ?? assetSeconds, assetSeconds)
            let clampedStart = max(0, min(adjustedTrimStart, max(0, clampedEnd - 0.05)))
            let trimmedSeconds = max(0.05, clampedEnd - clampedStart)
            let sourceTimeRange = CMTimeRange(
                start: CMTime(seconds: clampedStart, preferredTimescale: 600),
                duration: CMTime(seconds: trimmedSeconds, preferredTimescale: 600)
            )
            do {
                try compositionVideo.insertTimeRange(sourceTimeRange, of: videoTrack, at: offsetInsertTime)
            } catch {
                call.reject("A panel video could not be added to the export", nil, error)
                return
            }
            
            let endOnTimeline = CMTimeAdd(offsetInsertTime, sourceTimeRange.duration)
            longestDuration = CMTimeMaximum(longestDuration, endOnTimeline)

            let targetRect = multitrackRectFrame(rectDict, renderSize: renderSize)
            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideo)
            let geometry = multitrackVideoGeometry(track: videoTrack, targetRect: targetRect)
            layerInstruction.setCropRectangle(geometry.cropRect, at: .zero)
            layerInstruction.setTransform(geometry.transform, at: .zero)
            if let windows = source["layoutWindows"] as? [[String: Any]] {
                for window in windows {
                    let start = (window["startSec"] as? NSNumber)?.doubleValue ?? 0
                    let time = CMTime(seconds: max(0, start), preferredTimescale: 600)
                    if let rect = window["rect"] as? [String: Any] {
                        let frame = multitrackRectFrame(rect, renderSize: renderSize)
                        let placement = multitrackVideoGeometry(track: videoTrack, targetRect: frame)
                        layerInstruction.setCropRectangle(placement.cropRect, at: time)
                        layerInstruction.setTransform(placement.transform, at: time)
                        layerInstruction.setOpacity(1, at: time)
                    } else {
                        layerInstruction.setOpacity(0, at: time)
                    }
                }
            }
            layerInstruction.setOpacity(0, at: endOnTimeline)
            layerInstructions.append(layerInstruction)

            // Mixer state from Play All — muted panels export silent, others at
            // their set gain. Unset volume defaults to unity (untouched panels
            // export exactly as before).
            let sourceMuted = (source["muted"] as? NSNumber)?.boolValue ?? false
            let sourceVolume = sourceMuted
                ? 0
                : Float((source["volume"] as? NSNumber)?.doubleValue ?? 1.0)

            for audioTrack in asset.tracks(withMediaType: .audio) {
                guard let compositionAudio = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                ) else { continue }
                do {
                    try compositionAudio.insertTimeRange(sourceTimeRange, of: audioTrack, at: offsetInsertTime)
                    let parameters = AVMutableAudioMixInputParameters(track: compositionAudio)
                    parameters.setVolume(sourceVolume, at: .zero)
                    audioParameters.append(parameters)
                } catch {
                    call.reject("A panel audio track could not be added to the export", nil, error)
                    return
                }
            }
        }

        guard !layerInstructions.isEmpty else {
            call.reject("None of the panel videos could be read")
            return
        }

        if let backingDict = call.getObject("backingAudio"),
           let backingPath = backingDict["path"] as? String,
           let backingURL = fileURL(from: backingPath) {
            let backingAsset = AVURLAsset(url: backingURL)
            if let backingTrack = backingAsset.tracks(withMediaType: .audio).first {
                // Backing audio never extends the export past the panels' own
                // duration — trim it down if it's longer (e.g. a full song).
                let backingDuration = min(backingAsset.duration, longestDuration)
                let backingRange = CMTimeRange(start: .zero, duration: backingDuration)
                if let compositionBacking = composition.addMutableTrack(
                    withMediaType: .audio,
                    preferredTrackID: kCMPersistentTrackID_Invalid
                ) {
                    do {
                        try compositionBacking.insertTimeRange(backingRange, of: backingTrack, at: .zero)
                        let gain = Float(backingDict["gain"] as? Double ?? 1.0)
                        let parameters = AVMutableAudioMixInputParameters(track: compositionBacking)
                        parameters.setVolume(gain, at: .zero)
                        audioParameters.append(parameters)
                    } catch {
                        call.reject("The backing audio could not be added to the export", nil, error)
                        return
                    }
                }
            }
        }

        let instruction = AVMutableVideoCompositionInstruction()
        // Extend to the longest panel rather than crop to the shortest — a
        // panel that finished recording early just goes black/silent past its
        // own end instead of truncating footage from a longer panel.
        instruction.timeRange = CMTimeRange(start: .zero, duration: longestDuration)
        instruction.layerInstructions = layerInstructions

        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
        videoComposition.instructions = [instruction]

        let parentLayer = CALayer()
        parentLayer.frame = CGRect(origin: .zero, size: renderSize)
        parentLayer.isGeometryFlipped = true
        parentLayer.backgroundColor = UIColor.black.cgColor

        let videoLayer = CALayer()
        videoLayer.frame = parentLayer.bounds
        parentLayer.addSublayer(videoLayer)

        let decorationLayer = CALayer()
        decorationLayer.frame = parentLayer.bounds
        parentLayer.addSublayer(decorationLayer)

        // Draw every layout cell, including empty ones, so the final frame is a
        // deliberate connected grid instead of a set of floating rectangles.
        let gridRects = call.getArray("gridRects", JSObject.self) ?? []
        for rectAny in gridRects {
            let rect = rectAny as [String: Any]
            let borderLayer = CALayer()
            borderLayer.frame = multitrackRectFrame(rect, renderSize: renderSize)
            borderLayer.borderColor = UIColor.white.withAlphaComponent(0.42).cgColor
            borderLayer.borderWidth = 2
            decorationLayer.addSublayer(borderLayer)
        }

        // Sheet cue windows are expressed against the finished composition, so
        // the real composition length is what their key times are scaled by.
        let sheetTimelineDuration = max(CMTimeGetSeconds(longestDuration), durationHint)

        // One sheet layer builder, shared by the static image and by each timed
        // screenshot cue. Cues carry a window; the static case has none and
        // simply stays up for the whole render.
        func addSheetLayer(_ dict: [String: Any], window: (start: Double, end: Double?)?) {
            guard let sheetPath = dict["path"] as? String,
                  let sheetRectDict = dict["rect"] as? [String: Any],
                  let image = imageForCreatorStudioAsset(
                      path: sheetPath,
                      fileType: dict["fileType"] as? String ?? "image"
                  ) else { return }

            let fileType = dict["fileType"] as? String ?? "image"
            let requestedContentMode = dict["contentMode"] as? String
            // Existing image sessions have no contentMode. Default those to
            // fill as well, while PDFs keep their full-page fit behavior.
            let fillsViewport = fileType != "pdf" && requestedContentMode != "fit"
            let sheetFrame = multitrackRectFrame(sheetRectDict, renderSize: renderSize)
            let sheetViewport = CALayer()
            sheetViewport.frame = sheetFrame
            sheetViewport.backgroundColor = fillsViewport ? UIColor.black.cgColor : UIColor.white.cgColor
            sheetViewport.masksToBounds = true
            sheetViewport.borderColor = UIColor.white.withAlphaComponent(0.65).cgColor
            sheetViewport.borderWidth = 2

            let sheetLayer = CALayer()
            sheetLayer.frame = sheetViewport.bounds
            sheetLayer.contents = image.cgImage
            sheetLayer.contentsGravity = fillsViewport ? .resizeAspectFill : .resizeAspect
            let x = min(1.25, max(-0.25, (dict["x"] as? NSNumber)?.doubleValue ?? 0.5))
            let y = min(1.25, max(-0.25, (dict["y"] as? NSNumber)?.doubleValue ?? 0.5))
            let scale = min(2.5, max(0.6, (dict["scale"] as? NSNumber)?.doubleValue ?? 1))
            sheetLayer.position = CGPoint(
                x: sheetViewport.bounds.midX + (x - 0.5) * 0.7 * sheetViewport.bounds.width,
                y: sheetViewport.bounds.midY + (y - 0.5) * 0.7 * sheetViewport.bounds.height
            )
            sheetLayer.setAffineTransform(CGAffineTransform(scaleX: scale, y: scale))
            sheetViewport.addSublayer(sheetLayer)

            if let window = window, sheetTimelineDuration > 0 {
                // A hard opacity step (not a fade) reproduces the canvas cut.
                // The animation is anchored at AVCoreAnimationBeginTimeAtZero and
                // never removed, so it survives the whole offline render.
                let startFraction = min(1, max(0, window.start / sheetTimelineDuration))
                // Discrete keyframes take one MORE keyTime than value, starting
                // at 0 and ending at 1 — each value holds until the next time.
                var values: [NSNumber] = [0, 1]
                var keyTimes: [NSNumber] = [0, NSNumber(value: startFraction)]
                if let windowEnd = window.end, windowEnd < sheetTimelineDuration {
                    let endFraction = min(1, max(startFraction, windowEnd / sheetTimelineDuration))
                    values.append(0)
                    keyTimes.append(NSNumber(value: endFraction))
                }
                keyTimes.append(1)

                let animation = CAKeyframeAnimation(keyPath: "opacity")
                animation.calculationMode = .discrete
                animation.beginTime = AVCoreAnimationBeginTimeAtZero
                animation.duration = sheetTimelineDuration
                animation.isRemovedOnCompletion = false
                animation.fillMode = .both
                animation.values = values
                animation.keyTimes = keyTimes
                sheetViewport.opacity = startFraction <= 0 ? 1 : 0
                sheetViewport.add(animation, forKey: "sheetCueVisibility")
            }

            decorationLayer.addSublayer(sheetViewport)
        }

        let sheetMusicCues = call.getArray("sheetMusicCues", JSObject.self) ?? []
        if sheetMusicCues.count > 1 {
            for cueAny in sheetMusicCues {
                let cue = cueAny as [String: Any]
                let startSec = (cue["startSec"] as? NSNumber)?.doubleValue ?? 0
                let endSec = (cue["endSec"] as? NSNumber)?.doubleValue
                addSheetLayer(cue, window: (start: startSec, end: endSec))
            }
        } else if let sheetMusicDict = call.getObject("sheetMusic") {
            addSheetLayer(sheetMusicDict, window: nil)
        }

        videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(
            postProcessingAsVideoLayer: videoLayer,
            in: parentLayer
        )

        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetHighestQuality
        ) else {
            call.reject("Could not create export session")
            return
        }

        let audioMix = AVMutableAudioMix()
        audioMix.inputParameters = audioParameters
        exportSession.audioMix = audioMix
        exportSession.videoComposition = videoComposition
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("besttake-multitrack-\(UUID().uuidString).mp4")
        try? FileManager.default.removeItem(at: outputURL)
        exportSession.outputURL = outputURL

        print("[Multitrack] native render start sources=\(layerInstructions.count) aspect=\(aspectRatio) durationHint=\(durationHint)")
        exportSession.exportAsynchronously {
            DispatchQueue.main.async {
                if exportSession.status == .completed {
                    print("[Multitrack] native render complete path=\(outputURL.path)")
                    call.resolve([
                        "success": true,
                        "path": outputURL.absoluteString,
                        "durationSeconds": CMTimeGetSeconds(longestDuration)
                    ])
                } else if let error = exportSession.error {
                    print("[Multitrack] native render failed: \(error.localizedDescription)")
                    call.reject("Multitrack render failed", error.localizedDescription)
                } else {
                    call.reject("Multitrack render failed")
                }
            }
        }
    }
}
