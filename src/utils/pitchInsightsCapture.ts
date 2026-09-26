const STORAGE_KEY = 'besttake:pitch-insights-capture-enabled'
const LEGACY_ENSEMBLE_KEY = 'besttake:pitch-insights-ensemble-mode'

/** An old Ensemble Mode preference meant automatic collection was paused. */
export function loadPitchInsightsCaptureEnabled(): boolean {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved != null) return saved !== 'false'
    return localStorage.getItem(LEGACY_ENSEMBLE_KEY) !== 'true'
  } catch {
    return true
  }
}

export function savePitchInsightsCaptureEnabled(enabled: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, String(enabled)) }
  catch { /* Private browsing can make storage unavailable. */ }
}

export interface NoisyPitchWindow {
  startAt: number
  endAt: number
}

interface PitchChange {
  at: number
  from: number
  to: number
}

const ACTIVITY_WINDOW_MS = 12_000
const MAX_NOTE_DWELL_MS = 500
const MAX_FRAME_GAP_MS = 350
const MIN_WIDE_JUMP_SEMITONES = 4
const PROMPT_COOLDOWN_MS = 10 * 60_000

/**
 * Spots rapid back-and-forth pitch switches, which often happen when a
 * monophonic tuner hears several sources. It cannot identify the player;
 * detection only offers a reversible choice and never deletes on its own.
 */
export class PitchActivityDetector {
  private currentNote: number | null = null
  private currentStartedAt = 0
  private lastFrameAt = 0
  private changes: PitchChange[] = []
  private cooldownUntil = 0

  reset(clearCooldown = false): void {
    this.currentNote = null
    this.currentStartedAt = 0
    this.lastFrameAt = 0
    this.changes = []
    if (clearCooldown) this.cooldownUntil = 0
  }

  observe(midiNote: number | null, timestamp: number): NoisyPitchWindow | null {
    if (!Number.isFinite(timestamp)) return null
    if (midiNote == null || !Number.isFinite(midiNote)) {
      // Brief dropouts are common when several sounds compete for the tuner.
      // Preserve the previous pitch only across a genuinely continuous run.
      if (timestamp - this.lastFrameAt > MAX_FRAME_GAP_MS) this.reset()
      return null
    }

    const note = Math.round(midiNote)
    if (this.currentNote === note) {
      this.lastFrameAt = timestamp
      return null
    }

    const previousNote = this.currentNote
    const briefNote = timestamp - this.currentStartedAt <= MAX_NOTE_DWELL_MS
    const continuous = timestamp - this.lastFrameAt <= MAX_FRAME_GAP_MS
    if (previousNote != null && briefNote && continuous &&
        Math.abs(note - previousNote) >= MIN_WIDE_JUMP_SEMITONES) {
      this.changes.push({ at: timestamp, from: previousNote, to: note })
    }
    this.currentNote = note
    this.currentStartedAt = timestamp
    this.lastFrameAt = timestamp
    this.changes = this.changes.filter((change) => timestamp - change.at <= ACTIVITY_WINDOW_MS)

    if (timestamp < this.cooldownUntil || this.changes.length < 6) return null
    let reversals = 0
    for (let index = 1; index < this.changes.length; index += 1) {
      if (this.changes[index]!.to === this.changes[index - 1]!.from) reversals += 1
    }
    const distinctNotes = new Set(this.changes.flatMap((change) => [change.from, change.to])).size
    if (reversals < 3 && !(this.changes.length >= 9 && distinctNotes >= 4)) return null

    const startAt = Math.max(0, this.changes[0]!.at - 2_500)
    this.cooldownUntil = timestamp + PROMPT_COOLDOWN_MS
    this.changes = []
    return { startAt, endAt: timestamp + 1 }
  }
}
