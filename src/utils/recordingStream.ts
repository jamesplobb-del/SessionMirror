import type { RecordingMode } from '../types'

/**
 * Clone the video track for MediaRecorder so preview `<video>` play()/srcObject
 * churn does not stall the encoded video track mid-take. Audio stays on the live
 * mic track — cloning audio caused iOS Web Audio / MediaRecorder instability.
 */
export function buildRecorderStream(
  source: MediaStream,
  mode: RecordingMode,
): MediaStream {
  if (mode === 'audio') {
    return source
  }

  const videoTrack = source.getVideoTracks()[0]
  if (!videoTrack) {
    return source
  }

  const recordStream = new MediaStream()
  source.getAudioTracks().forEach((track) => recordStream.addTrack(track))
  recordStream.addTrack(videoTrack.clone())
  return recordStream
}

export function releaseRecorderStream(
  recordStream: MediaStream | null,
  previewStream: MediaStream | null,
): void {
  if (!recordStream || recordStream === previewStream) return
  recordStream.getTracks().forEach((track) => {
    if (track.kind === 'video') {
      try {
        track.stop()
      } catch {
        /* ignore */
      }
    }
  })
}
