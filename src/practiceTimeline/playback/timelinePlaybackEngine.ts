import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import { bpmAtMeasure } from './tempoAutomation'
import { effectiveBars, resolveSectionTiming } from '../timeSignatureLogic'
import type {
  PracticeTimeline,
  PracticeTimelineMarker,
  TimelinePlaybackState,
  TimelineSection,
} from '../types'

export interface TimelinePlaybackCallbacks {
  onSectionStart?: (section: TimelineSection, index: number, timeSeconds: number) => void
  onSectionEnd?: (section: TimelineSection, index: number, timeSeconds: number) => void
  onFinished?: (markers: PracticeTimelineMarker[]) => void
  onStateChange?: (state: TimelinePlaybackState) => void
}

export class TimelinePlaybackEngine {
  private timeline: PracticeTimeline | null = null
  private sectionIndex = 0
  private measure = 1
  private playing = false
  private finished = false
  private elapsedSeconds = 0
  private markers: PracticeTimelineMarker[] = []
  private callbacks: TimelinePlaybackCallbacks = {}
  private unsubscribeBar: (() => void) | null = null
  private countInRemaining = 0
  private sessionStart = 0
  private recordingOffsetSeconds = 0

  setCallbacks(callbacks: TimelinePlaybackCallbacks): void {
    this.callbacks = callbacks
  }

  getState(): TimelinePlaybackState {
    const section = this.timeline?.sections[this.sectionIndex]
    return {
      playing: this.playing,
      finished: this.finished,
      sectionIndex: this.sectionIndex,
      measure: this.measure,
      totalMeasuresInSection: section ? effectiveBars(section) : 0,
      elapsedSeconds: this.elapsedSeconds,
    }
  }

  getMarkers(): PracticeTimelineMarker[] {
    return [...this.markers]
  }

  getCurrentSection(): TimelineSection | undefined {
    return this.timeline?.sections[this.sectionIndex]
  }

  getNextSection(): TimelineSection | undefined {
    return this.timeline?.sections[this.sectionIndex + 1]
  }

  async start(timeline: PracticeTimeline, recordingOffsetSeconds = 0): Promise<boolean> {
    if (timeline.sections.length === 0) return false

    this.stop()
    this.timeline = timeline
    this.sectionIndex = 0
    this.measure = 1
    this.playing = true
    this.finished = false
    this.elapsedSeconds = 0
    this.markers = []
    this.recordingOffsetSeconds = recordingOffsetSeconds
    this.sessionStart = performance.now()

    this.applyCurrentSection()
    this.recordSectionMarker()

    this.unsubscribeBar = sharedMetronomeEngine.subscribeBar(() => {
      this.handleBarComplete()
    })

    const started = await sharedMetronomeEngine.start()
    if (!started) {
      this.stop()
      return false
    }

    this.emitState()
    return true
  }

  stop(): void {
    this.unsubscribeBar?.()
    this.unsubscribeBar = null
    sharedMetronomeEngine.stop()
    this.playing = false
    this.finished = false
    this.emitState()
  }

  private emitState(): void {
    this.callbacks.onStateChange?.(this.getState())
  }

  private applyCurrentSection(): void {
    const section = this.getCurrentSection()
    if (!section) return

    const timing = resolveSectionTiming(section)
    const ramp = section.advanced?.tempoRamp
    const bpm = bpmAtMeasure(section.bpm, this.measure, effectiveBars(section), ramp)

    sharedMetronomeEngine.applySectionConfig({
      bpm,
      meter: timing.meter,
      subdivision: timing.subdivision,
      feelId: timing.feelId,
      accentLevels: timing.accentLevels,
      soundId: section.advanced?.clickSoundId,
    })

    const countIn = section.advanced?.countInBars ?? 0
    this.countInRemaining = countIn
    if (countIn > 0) this.measure = 0

    this.callbacks.onSectionStart?.(section, this.sectionIndex, this.elapsedSeconds)
  }

  private recordSectionMarker(): void {
    const section = this.getCurrentSection()
    if (!section) return
    this.markers.push({
      sectionId: section.id,
      title: section.title,
      timeSeconds: this.recordingOffsetSeconds + this.elapsedSeconds,
      bars: section.bars,
      meter: section.meter,
      bpm: section.bpm,
    })
  }

  private handleBarComplete(): void {
    if (!this.playing || this.finished || !this.timeline) return

    const section = this.getCurrentSection()
    if (!section) return

    this.elapsedSeconds = (performance.now() - this.sessionStart) / 1000

    if (this.countInRemaining > 0) {
      this.countInRemaining -= 1
      if (this.countInRemaining > 0) {
        this.emitState()
        return
      }
      this.measure = 1
      this.emitState()
      return
    }

    const totalMeasures = effectiveBars(section)
    const timing = resolveSectionTiming(section)
    const ramp = section.advanced?.tempoRamp
    const nextMeasure = this.measure + 1

    if (nextMeasure <= totalMeasures) {
      this.measure = nextMeasure
      sharedMetronomeEngine.applySectionConfig({
        bpm: bpmAtMeasure(section.bpm, this.measure, totalMeasures, ramp),
        meter: section.meter,
        subdivision: timing.subdivision,
        feelId: timing.feelId,
        accentLevels: timing.accentLevels,
        soundId: section.advanced?.clickSoundId,
      })
      this.emitState()
      return
    }

    this.callbacks.onSectionEnd?.(section, this.sectionIndex, this.elapsedSeconds)

    const nextIndex = this.sectionIndex + 1
    if (nextIndex >= this.timeline.sections.length) {
      this.finished = true
      this.playing = false
      sharedMetronomeEngine.stop()
      this.unsubscribeBar?.()
      this.unsubscribeBar = null
      this.emitState()
      this.callbacks.onFinished?.(this.markers)
      return
    }

    this.sectionIndex = nextIndex
    this.measure = 1
    this.applyCurrentSection()
    this.recordSectionMarker()
    this.emitState()
  }
}

export const timelinePlaybackEngine = new TimelinePlaybackEngine()
