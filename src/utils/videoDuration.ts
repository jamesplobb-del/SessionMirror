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
