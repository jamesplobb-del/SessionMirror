/** One offline render at a time; originals remain available for immediate playback. */
let pending: Promise<void> = Promise.resolve()
export function queueAudioEnhancement(work: () => Promise<void>): Promise<void> {
  const task = pending.catch(() => {}).then(work)
  pending = task
  return task
}
