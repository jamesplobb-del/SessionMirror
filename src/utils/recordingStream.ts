import type { RecordingMode } from '../types'

/** Record from the live preview stream — cloning tracks can stall iOS video mid-take. */
export function buildRecorderStream(
  source: MediaStream,
  _mode: RecordingMode,
): MediaStream {
  return source
}

export function releaseRecorderStream(
  _recordStream: MediaStream | null,
  _previewStream: MediaStream | null,
): void {
  /* same stream as preview — never stop camera tracks here */
}
