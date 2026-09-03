/** Best-effort playable duration for scrubbing (handles bad MP4 metadata). */
export function getPlayableDuration(media: HTMLMediaElement): number {
  if (Number.isFinite(media.duration) && media.duration > 0) {
    return media.duration
  }

  if (media.seekable.length > 0) {
    const end = media.seekable.end(media.seekable.length - 1)
    if (Number.isFinite(end) && end > 0) {
      return end
    }
  }

  return 0
}

/**
 * Clock-format a duration in seconds — 247 becomes "4:07".
 *
 * Hours are only shown once there are any, so a typical take reads as m:ss
 * rather than a padded 0:04:07.
 */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '0:00'

  const whole = Math.round(totalSeconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
