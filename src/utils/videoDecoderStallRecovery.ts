type FrameWatchVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: { presentedFrames?: number }) => void,
  ) => number
  cancelVideoFrameCallback?: (handle: number) => void
  webkitDecodedFrameCount?: number
}

export interface VideoDecoderStallRecoveryOptions {
  /**
   * Returns true while the element still has a valid source. When false, the
   * hard pause/load/seek recovery step is skipped (reloading would be unsafe).
   * Defaults to checking `media.src || media.currentSrc`.
   */
  hasSource?: () => boolean
  /**
   * When set, emits tightly-scoped diagnostics (attach, periodic sample, stall
   * detection, nudge, hard reload) prefixed with this label. Used to diagnose
   * the hands-free post-record freeze from device logs.
   */
  debugLabel?: string
}

/**
 * Watches an <video> element for a stalled hardware decoder: the case where
 * `currentTime` (and audio) keep advancing but no new frames are presented,
 * i.e. the picture freezes while sound continues. When detected, it nudges the
 * decoder with a tiny seek, escalating to a pause/load/seek reload if the stall
 * persists. This mirrors the recovery used by TakeVideoPlayer (vault/review
 * playback) so hands-free post-record playback gets the same protection.
 *
 * Returns a cleanup function.
 */
export function attachVideoDecoderStallRecovery(
  element: HTMLVideoElement,
  options: VideoDecoderStallRecoveryOptions = {},
): () => void {
  const media = element as FrameWatchVideo

  let stopped = false
  let frameCallbackId: number | null = null
  let intervalId: number | null = null
  let lastPresentedFrames =
    media.webkitDecodedFrameCount ?? media.getVideoPlaybackQuality?.().totalVideoFrames ?? 0
  let lastMediaTime = media.currentTime || 0
  let lastFrameAt = performance.now()
  let lastNudgeAt = 0
  let stallRecoveries = 0

  const label = options.debugLabel
  const log = (event: string, detail: Record<string, unknown> = {}) => {
    if (!label) return
    console.log(`[StallWatch:${label}] ${event}`, JSON.stringify(detail))
  }

  const hasSource = () =>
    options.hasSource ? options.hasSource() : Boolean(media.src || media.currentSrc)

  let sampleCount = 0

  const readPresentedFrames = () =>
    media.webkitDecodedFrameCount ??
    media.getVideoPlaybackQuality?.().totalVideoFrames ??
    lastPresentedFrames

  const nudgeVideoDecoder = () => {
    const now = performance.now()
    if (now - lastNudgeAt < 1600) return
    lastNudgeAt = now
    stallRecoveries += 1

    const duration = Number.isFinite(media.duration) ? media.duration : 0
    const current = media.currentTime || 0
    const maxTime = duration > 0 ? Math.max(0, duration - 0.08) : current + 0.25
    const seekStep = stallRecoveries === 1 ? 0.04 : 0.22
    const target = Math.min(maxTime, current + seekStep)

    log('nudge', {
      attempt: stallRecoveries,
      from: Number(current.toFixed(3)),
      to: Number(target.toFixed(3)),
      duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(3)) : null,
    })

    try {
      media.currentTime = target
      if (!media.paused && !media.ended) {
        void media.play().catch(() => undefined)
      }
    } catch {
      /* ignore decoder recovery failures */
    }

    if (stallRecoveries < 3 || !hasSource()) return

    log('hard-reload', { at: Number(current.toFixed(3)) })

    window.setTimeout(() => {
      if (stopped || media.paused || media.ended) return
      const resumeAt = Math.min(maxTime, (media.currentTime || current) + 0.02)
      try {
        media.pause()
        media.load()
        media.currentTime = resumeAt
        void media.play().catch(() => undefined)
        stallRecoveries = 0
        lastFrameAt = performance.now()
        lastMediaTime = media.currentTime || resumeAt
      } catch {
        /* ignore hard decoder recovery failures */
      }
    }, 80)
  }

  const sample = () => {
    if (
      stopped ||
      media.paused ||
      media.ended ||
      media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      lastMediaTime = media.currentTime || 0
      lastPresentedFrames = readPresentedFrames()
      lastFrameAt = performance.now()
      return
    }

    const now = performance.now()
    const currentTime = media.currentTime || 0
    const presentedFrames = readPresentedFrames()
    const timeAdvanced = currentTime - lastMediaTime > 0.18
    const framesAdvanced = presentedFrames > lastPresentedFrames

    sampleCount += 1
    if (label && sampleCount % 3 === 0) {
      log('sample', {
        t: Number(currentTime.toFixed(2)),
        frames: presentedFrames,
        framesAdvanced,
        timeAdvanced,
        sinceFrameMs: Math.round(now - lastFrameAt),
        readyState: media.readyState,
      })
    }

    if (framesAdvanced) {
      lastPresentedFrames = presentedFrames
      lastFrameAt = now
      stallRecoveries = 0
    } else if (timeAdvanced && now - lastFrameAt > 1250) {
      log('stall-detected', {
        t: Number(currentTime.toFixed(2)),
        frames: presentedFrames,
        sinceFrameMs: Math.round(now - lastFrameAt),
      })
      nudgeVideoDecoder()
      lastFrameAt = now
    } else if (!timeAdvanced && !framesAdvanced && now - lastFrameAt > 1250) {
      // Neither the clock nor frames advanced: element itself is wedged
      // (not a pure decoder stall). A seek nudge may still shake it loose.
      log('hard-stall (clock frozen too)', {
        t: Number(currentTime.toFixed(2)),
        frames: presentedFrames,
        paused: media.paused,
        ended: media.ended,
        sinceFrameMs: Math.round(now - lastFrameAt),
      })
      nudgeVideoDecoder()
      lastFrameAt = now
    }

    lastMediaTime = currentTime
  }

  const scheduleFrameWatch = () => {
    if (stopped || !media.requestVideoFrameCallback) return
    frameCallbackId = media.requestVideoFrameCallback((_now, metadata) => {
      if (typeof metadata.presentedFrames === 'number') {
        lastPresentedFrames = metadata.presentedFrames
        lastFrameAt = performance.now()
      }
      scheduleFrameWatch()
    })
  }

  scheduleFrameWatch()
  intervalId = window.setInterval(sample, 350)
  log('attached', {
    hasRVFC: typeof media.requestVideoFrameCallback === 'function',
    readyState: media.readyState,
    duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(3)) : null,
  })

  return () => {
    stopped = true
    log('detached', { t: Number((media.currentTime || 0).toFixed(2)) })
    if (frameCallbackId !== null) {
      media.cancelVideoFrameCallback?.(frameCallbackId)
      frameCallbackId = null
    }
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  }
}
