import type { RecordingMode } from '../types'

/** Clone only video — shared mic track keeps iOS MediaRecorder stable. */
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
  recordStream.getTracks().forEach((track) => track.stop())
}
