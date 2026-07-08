import { primePlaybackAudioContextSync } from '../../utils/playbackAudioContext'

/**
 * Master transport clock for multitrack.
 *
 * The single timebase every multitrack subsystem reads from. It is derived from
 * the shared Web Audio `AudioContext.currentTime` — the only monotonic,
 * sample-derived clock available to the WebView (the same clock the metronome
 * already schedules against). Media-element `.currentTime` is coarse and jittery
 * and must never define the timeline; instead each element is *slaved* to this
 * transport, and the transport is *locked* onto real playback once, after
 * startup latency has settled.
 *
 * Design rules (see HANDOFF-MULTITRACK architecture):
 *  - There is exactly one timeline. Everything subscribes to it.
 *  - Playback follows the transport; it never defines synchronization.
 *  - Recording is timestamped against this clock, not started "together" with
 *    playback.
 */

export type TransportState = 'stopped' | 'armed' | 'rolling'

class MultitrackTransport {
  private ctx: AudioContext | null = null
  /** ctx.currentTime value that corresponds to timeline position 0. */
  private epoch = 0
  /** Timeline position held while not rolling. */
  private heldAt = 0
  private state: TransportState = 'stopped'

  private ensureCtx(): AudioContext | null {
    if (this.ctx && this.ctx.state !== 'closed') return this.ctx
    try {
      this.ctx = primePlaybackAudioContextSync()
    } catch {
      this.ctx = null
    }
    return this.ctx
  }

  /** Current value of the underlying clock, in seconds. */
  now(): number {
    const ctx = this.ensureCtx()
    return ctx ? ctx.currentTime : performance.now() / 1000
  }

  getState(): TransportState {
    return this.state
  }

  /** Reserve timeline zero (or another position) without rolling yet. */
  arm(positionSec = 0): void {
    this.ensureCtx()
    this.heldAt = Math.max(0, positionSec)
    this.state = 'armed'
  }

  /** Begin rolling from a timeline position; epoch anchored to the clock now. */
  start(positionSec = this.heldAt): void {
    this.ensureCtx()
    this.epoch = this.now() - Math.max(0, positionSec)
    this.state = 'rolling'
  }

  /**
   * Begin rolling with timeline zero pinned to an absolute clock time (may be
   * slightly in the future — e.g. the metronome's scheduled first click).
   * position() clamps at 0 until that moment arrives.
   */
  startAtClockTime(clockTime: number): void {
    this.ensureCtx()
    this.epoch = clockTime
    this.state = 'rolling'
  }

  /**
   * Re-anchor so `position()` equals `positionSec` at this instant. Used to lock
   * the transport onto confirmed real playback (after startup jitter), to follow
   * a seek, or to correct a gross deviation (stall/scrub) mid-roll.
   */
  reanchor(positionSec: number): void {
    const p = Math.max(0, positionSec)
    if (this.state === 'rolling') {
      this.epoch = this.now() - p
    } else {
      this.heldAt = p
    }
  }

  position(): number {
    if (this.state === 'rolling') return Math.max(0, this.now() - this.epoch)
    return this.heldAt
  }

  /** Timeline position that corresponded to a past clock timestamp (event anchoring). */
  positionAt(clockTime: number): number {
    if (this.state !== 'rolling') return this.heldAt
    return Math.max(0, clockTime - this.epoch)
  }

  pause(): void {
    if (this.state === 'rolling') this.heldAt = this.position()
    this.state = 'stopped'
  }

  stop(): void {
    this.heldAt = 0
    this.state = 'stopped'
  }
}

export const multitrackTransport = new MultitrackTransport()
