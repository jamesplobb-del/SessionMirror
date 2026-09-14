import UIKit
import AVFoundation
@main class AuditApp: UIResponder, UIApplicationDelegate {
 var window:UIWindow?
 let output=FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0]
 var results:[[String:Any]]=[]
 func application(_ app:UIApplication,didFinishLaunchingWithOptions options:[UIApplication.LaunchOptionsKey:Any]?=nil)->Bool {
  window=UIWindow(frame:UIScreen.main.bounds);let vc=UIViewController();vc.view.backgroundColor = .blue;window?.rootViewController=vc;window?.makeKeyAndVisible()
  Task {do {try await run()}catch {results.append(["fatal":String(describing:error)])};save()};return true
 }
 func save(){try? JSONSerialization.data(withJSONObject:results,options:.prettyPrinted).write(to:output.appendingPathComponent("results.json"));print("AUDIT COMPLETE \(output.path)")}
 func export(_ asset:AVAsset,_ path:URL) async throws {let e=AVAssetExportSession(asset:asset,presetName:AVAssetExportPresetHighestQuality)!;e.outputURL=path;e.outputFileType = .mov;await e.export();if let error=e.error {throw error}}
 func makeClip(_ name:String,_ hz:Double,_ color:UIColor) async throws ->URL {
  let video=output.appendingPathComponent(name+"-silent.mov");let w=try AVAssetWriter(outputURL:video,fileType:.mov)
  let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:160,AVVideoHeightKey:160]);w.add(input)
  let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:160,kCVPixelBufferHeightKey as String:160]);w.startWriting();w.startSession(atSourceTime:.zero)
  for i in 0..<120 {
   while !input.isReadyForMoreMediaData {try await Task.sleep(nanoseconds:1_000_000)}
   var buffer:CVPixelBuffer?;CVPixelBufferPoolCreatePixelBuffer(nil,adaptor.pixelBufferPool!,&buffer);let b=buffer!;CVPixelBufferLockBaseAddress(b,[])
   let c=CGContext(data:CVPixelBufferGetBaseAddress(b),width:160,height:160,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(b),space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!
   c.setFillColor(color.cgColor);c.fill(CGRect(x:0,y:0,width:160,height:160));CVPixelBufferUnlockBaseAddress(b,[]);adaptor.append(b,withPresentationTime:CMTime(value:Int64(i),timescale:30))
  };input.markAsFinished();await w.finishWriting();if let error=w.error{throw error}
  let wav=output.appendingPathComponent(name+".caf");let f=AVAudioFormat(standardFormatWithSampleRate:44100,channels:1)!;let a=try AVAudioFile(forWriting:wav,settings:f.settings);let b=AVAudioPCMBuffer(pcmFormat:f,frameCapacity:176400)!;b.frameLength=176400
  for i in 0..<176400 {b.floatChannelData![0][i]=Float(0.2*sin(2*Double.pi*hz*Double(i)/44100))};try a.write(from:b)
  let composition=AVMutableComposition();let va=AVURLAsset(url:video);let aa=AVURLAsset(url:wav);let range=CMTimeRange(start:.zero,duration:CMTime(seconds:4,preferredTimescale:600))
  try composition.addMutableTrack(withMediaType:.video,preferredTrackID:kCMPersistentTrackID_Invalid)!.insertTimeRange(range,of:va.tracks(withMediaType:.video)[0],at:.zero)
  try composition.addMutableTrack(withMediaType:.audio,preferredTrackID:kCMPersistentTrackID_Invalid)!.insertTimeRange(range,of:aa.tracks(withMediaType:.audio)[0],at:.zero)
  let target=output.appendingPathComponent(name+".mov");try await export(composition,target);return target
 }
 func inspect(_ path:URL)throws->[String:Any]{
  let asset=AVURLAsset(url:path);let tracks=asset.tracks(withMediaType:.audio);var samples=[Float]();var rate=44100.0
  if let track=tracks.first {
   let reader=try AVAssetReader(asset:asset);let out=AVAssetReaderTrackOutput(track:track,outputSettings:[AVFormatIDKey:kAudioFormatLinearPCM,AVLinearPCMIsFloatKey:true,AVLinearPCMBitDepthKey:32,AVLinearPCMIsNonInterleaved:false]);reader.add(out);reader.startReading()
   while let buffer=out.copyNextSampleBuffer(){if let desc=CMSampleBufferGetFormatDescription(buffer),let asbd=CMAudioFormatDescriptionGetStreamBasicDescription(desc){rate=asbd.pointee.mSampleRate;let channels=Int(asbd.pointee.mChannelsPerFrame);if let block=CMSampleBufferGetDataBuffer(buffer){let count=CMBlockBufferGetDataLength(block)/4;var chunk=[Float](repeating:0,count:count);chunk.withUnsafeMutableBytes{_ = CMBlockBufferCopyDataBytes(block,atOffset:0,dataLength:count*4,destination:$0.baseAddress!)};for i in stride(from:0,to:count,by:channels){samples.append(chunk[i])}}}}
  }
  func rms(_ start:Double,_ end:Double)->Double{let a=min(samples.count,Int(start*rate)),b=min(samples.count,Int(end*rate));if b<=a{return 0};return sqrt(samples[a..<b].reduce(0){$0+Double($1*$1)}/Double(b-a))}
  func magnitude(_ hz:Double)->Double{let a=min(samples.count,Int(rate*1.2)),b=min(samples.count,Int(rate*1.7));if b<=a{return 0};var re=0.0,im=0.0;for i in a..<b{let phase=2*Double.pi*hz*Double(i)/rate;re += Double(samples[i])*cos(phase);im += Double(samples[i])*sin(phase)};return 2*sqrt(re*re+im*im)/Double(b-a)}
  let video=asset.tracks(withMediaType:.video).first
  return ["file":path.path,"bytes":(try FileManager.default.attributesOfItem(atPath:path.path)[.size])!,"duration":CMTimeGetSeconds(asset.duration),"videoTracks":asset.tracks(withMediaType:.video).count,"audioTracks":tracks.count,"width":video?.naturalSize.width ?? 0,"height":video?.naturalSize.height ?? 0,"rmsFirstHalfSecond":rms(0,0.5),"rmsAtOneSecond":rms(1.2,1.7),"tone440":magnitude(440),"tone880":magnitude(880)]
 }
 func render(_ name:String,_ sources:[JSObject],backing:JSObject?=nil) async {
  do {var data:JSObject=["aspectRatio":"9:16","durationSeconds":4.0,"sources":sources];if let backing{data["backingAudio"]=backing}
   let reply:JSObject=try await withCheckedThrowingContinuation{continuation in Renderer().renderMultitrackVideo(CAPPluginCall(data){continuation.resume(with:$0)})}
   let src=URL(string:reply["path"] as! String)!;let dest=output.appendingPathComponent(name+".mp4");try FileManager.default.copyItem(at:src,to:dest);var row=try inspect(dest);row["name"]=name;row["renderSucceeded"]=true;results.append(row)
  }catch{results.append(["name":name,"renderSucceeded":false,"error":String(describing:error)])};save()
 }
 func run()async throws{
  let a=output.appendingPathComponent("red440.mov"),b=output.appendingPathComponent("blue880.mov")
  let left:JSObject=["xPercent":0,"yPercent":0,"widthPercent":50,"heightPercent":100],right:JSObject=["xPercent":50,"yPercent":0,"widthPercent":50,"heightPercent":100]
  let sa:JSObject=["id":"a","path":a.path,"rect":left];let sb:JSObject=["id":"b","path":b.path,"rect":right]
  await render("two-tracks",[sa,sb])
  var muted=sb;muted["muted"]=true;await render("second-muted",[sa,muted])
  var trim=sa;trim["trimStartSec"]=1.0;trim["trimEndSec"]=3.0;trim["timelineOffsetMs"] = -1000.0;await render("trim-delayed",[trim])
  var early=sa;early["trimStartSec"]=1.0;early["trimEndSec"]=3.0;early["timelineOffsetMs"]=500.0;await render("trim-early",[early])
  await render("missing-backing",[sa],backing:["path":output.appendingPathComponent("missing.caf").path,"gain":1.0])
 }
}
