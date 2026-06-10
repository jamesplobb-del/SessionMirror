import type { RecordingMode } from '../types'

/** Record from the live preview stream — cloning tracks caused preview resets on iOS. */
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
  /* same stream as preview — never stop cloned tracks here */
}
