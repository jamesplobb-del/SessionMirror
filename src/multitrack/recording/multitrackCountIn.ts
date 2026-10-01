/** Every multitrack recording has an audible lead-in, even with its click track off. */
export function recordingCountInBars(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(8, Math.round(value)))
    : 1
}
