import type { RecordingMode } from '../types'

/**
 * Dedicated stream for MediaRecorder — cloned tracks so Web Audio (pitch monitor)
 * and the live preview never share an encoder sink with the recorder.
 */
export function buildRecorderStream(
  source: MediaStream,
  mode: RecordingMode,
): MediaStream {
  const recordStream = new MediaStream()

  source.getAudioTracks().forEach((track) => {
    recordStream.addTrack(track.clone())
  })

  if (mode === 'video') {
    const videoTrack = source.getVideoTracks()[0]
    if (videoTrack) {
      recordStream.addTrack(videoTrack.clone())
    }
  }

  return recordStream
}

export function releaseRecorderStream(
  recordStream: MediaStream | null,
  previewStream: MediaStream | null,
): void {
  if (!recordStream || recordStream === previewStream) return
  recordStream.getTracks().forEach((track) => track.stop())
}
