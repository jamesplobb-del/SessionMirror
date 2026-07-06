import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import { clampBpm } from '../../utils/metronomeConfig'
import { resolveSectionPlaybackBpm } from '../tempoDepth'
import {
  formatPatternMetersLabel,
  resolveSectionTimingAtMeasure,
  sectionHasMeterPattern,
} from '../patternLogic'
import { effectiveBars } from '../timeSignatureLogic'
import type {
  PracticeTimeline,
  PracticeTimelineMarker,
  PracticeTrackSettings,
  TimelinePlaybackState,
  TimelineSection,
} from '../types'

export const TEMPO_SCALE_MIN = 0.5
export const TEMPO_SCALE_MAX = 1.5
export const TEMPO_SCALE_STEP = 0.05

export interface TimelinePlaybackCallbacks {
  onSectionStart?: (section: TimelineSection, index: number, timeSeconds: number) => void
  onSectionEnd?: (section: TimelineSection, index: number, timeSeconds: number) => void
  onFinished?: (markers: PracticeTimelineMarker[]) => void
  onStateChange?: (state: TimelinePlaybackState) => void
}

export interface PrepareSessionOptions {
  recordingOffsetSeconds?: number
  startSectionIndex?: number
}

function clampTempoScale(scale: number): number {
  return Math.min(TEMPO_SCALE_MAX, Math.max(TEMPO_SCALE_MIN, scale))
}

function trackSettings(timeline: PracticeTimeline): PracticeTrackSettings {
  return {
    countInBars: timeline.settings?.countInBars ?? 0,
    countInWhen: timeline.settings?.countInWhen ?? 'start',
    loopTrack: timeline.settings?.loopTrack ?? false,
  }
}

export class TimelinePlaybackEngine {
  private timeline: PracticeTimeline | null = null
  private sectionIndex = 0
  private measure = 1
  private sessionActive = false
  private playing = false
  private finished = false
  private elapsedSeconds = 0
  private tempoScale = 1
  private markers: PracticeTimelineMarker[] = []
  private callbacks: TimelinePlaybackCallbacks = {}
  private unsubscribeBar: (() => void) | null = null
  private unsubscribePulse: (() => void) | null = null
  private countInRemaining = 0
  private sessionStart = 0
  private recordingOffsetSeconds = 0
  private lastPatternStepIndex: number | null = null
  private conductingBeat = 1

  setCallbacks(callbacks: TimelinePlaybackCallbacks): void {
    this.callbacks = callbacks
  }

  private scaledBpm(baseBpm: number): number {
    return clampBpm(Math.round(baseBpm * this.tempoScale))
  }

  private baseBpmForCurrentMeasure(section: TimelineSection): number {
    const timing = this.getTimingForCurrentMeasure(section)
    return resolveSectionPlaybackBpm(
      section,
      this.measure,
      this.conductingBeat,
      timing.pulseCount,
    )
  }

  private getTimingForCurrentMeasure(section: TimelineSection) {
    const previousSection =
      this.sectionIndex > 0 ? this.timeline?.sections[this.sectionIndex - 1] : undefined
    return resolveSectionTimingAtMeasure(section, this.measure, previousSection)
  }

  private patternFieldsForState(section: TimelineSection) {
    if (!sectionHasMeterPattern(section)) {
      return { patternStepIndex: undefined, patternStepMeter: undefined, patternLabel: undefined }
    }
    const timing = this.getTimingForCurrentMeasure(section)
    return {
      patternStepIndex: timing.stepIndex,
      patternStepMeter: timing.meter,
      patternLabel: formatPatternMetersLabel(section.patternSteps!),
    }
  }

  getState(): TimelinePlaybackState {
    const section = this.timeline?.sections[this.sectionIndex]
    const baseBpm = section ? this.baseBpmForCurrentMeasure(section) : 0
    const patternFields = section ? this.patternFieldsForState(section) : {}
    return {
      sessionActive: this.sessionActive,
      playing: this.playing,
      finished: this.finished,
      sectionIndex: this.sectionIndex,
      measure: this.measure,
      totalMeasuresInSection: section ? effectiveBars(section) : 0,
      elapsedSeconds: this.elapsedSeconds,
      tempoScale: this.tempoScale,
      effectiveBpm: section ? this.scaledBpm(baseBpm) : 0,
      countInActive: this.countInRemaining > 0,
      ...patternFields,
    }
  }

  getTimeline(): PracticeTimeline | null {
    return this.timeline
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

  prepareSession(
    timeline: PracticeTimeline,
    options: PrepareSessionOptions = {},
  ): boolean {
    if (timeline.sections.length === 0) return false

    this.detachBarListener()
    sharedMetronomeEngine.stop()

    const startIndex = Math.max(
      0,
      Math.min(options.startSectionIndex ?? 0, timeline.sections.length - 1),
    )

    this.timeline = timeline
    this.sectionIndex = startIndex
    this.measure = 1
    this.conductingBeat = 1
    this.sessionActive = true
    this.playing = false
    this.finished = false
    this.elapsedSeconds = 0
    this.tempoScale = 1
    this.markers = []
    this.recordingOffsetSeconds = options.recordingOffsetSeconds ?? 0
    this.sessionStart = performance.now()
    this.countInRemaining = 0
    this.lastPatternStepIndex = null

    this.applyCurrentSection()
    this.armCountInForCurrentPosition('start')
    this.recordSectionMarker()
    this.emitState()
    return true
  }

  async togglePlay(): Promise<boolean> {
    if (!this.sessionActive || !this.timeline) return false

    if (this.playing) {
      this.pause()
      return true
    }

    return this.play()
  }

  private async play(): Promise<boolean> {
    if (!this.sessionActive || !this.timeline) return false

    if (this.finished) {
      this.resetToBeginning()
    }

    this.applyCurrentSection()
    this.attachBarListener()

    const started = await sharedMetronomeEngine.start()
    if (!started) {
      this.detachBarListener()
      return false
    }

    this.playing = true
    this.emitState()
    return true
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.detachBarListener()
    sharedMetronomeEngine.stop()
    this.emitState()
  }

  resetToBeginning(): void {
    if (!this.timeline) return
    const wasPlaying = this.playing
    if (wasPlaying) {
      this.pause()
    }
    this.sectionIndex = 0
    this.measure = 1
    this.conductingBeat = 1
    this.finished = false
    this.countInRemaining = 0
    this.lastPatternStepIndex = null
    this.applyCurrentSection()
    this.armCountInForCurrentPosition('start')
    this.emitState()
  }

  exitSession(): void {
    this.detachBarListener()
    sharedMetronomeEngine.stop()
    this.timeline = null
    this.sessionActive = false
    this.playing = false
    this.finished = false
    this.sectionIndex = 0
    this.measure = 1
    this.conductingBeat = 1
    this.tempoScale = 1
    this.countInRemaining = 0
    this.emitState()
  }

  stop(): void {
    this.exitSession()
  }

  setTempoScale(scale: number): void {
    this.tempoScale = clampTempoScale(scale)
    if (this.sessionActive) {
      this.applyCurrentSection({ tempoOnly: true })
      this.emitState()
    }
  }

  adjustTempoScale(delta: number): void {
    this.setTempoScale(this.tempoScale + delta)
  }

  setCurrentEffectiveBpm(bpm: number): void {
    const section = this.getCurrentSection()
    if (!section) return

    const baseBpm = this.baseBpmForCurrentMeasure(section)
    if (baseBpm <= 0) return

    this.setTempoScale(bpm / baseBpm)
  }

  goToSection(index: number): void {
    if (!this.timeline || index < 0 || index >= this.timeline.sections.length) return
    if (index === this.sectionIndex && this.countInRemaining <= 0) return

    this.sectionIndex = index
    this.measure = 1
    this.conductingBeat = 1
    this.countInRemaining = 0
    this.finished = false
    this.lastPatternStepIndex = null
    this.applyCurrentSection()
    this.armCountInForCurrentPosition('jump')
    this.recordSectionMarker()
    this.emitState()
  }

  skipSection(direction: -1 | 1): void {
    this.goToSection(this.sectionIndex + direction)
  }

  seekToMeasure(measure: number): void {
    const section = this.getCurrentSection()
    if (!this.timeline || !section) return

    const totalMeasures = effectiveBars(section)
    const nextMeasure = Math.max(1, Math.min(totalMeasures, Math.round(measure)))

    this.measure = nextMeasure
    this.conductingBeat = 1
    this.countInRemaining = 0
    this.finished = false
    this.applyCurrentSection({ forceResetBeat: true })
    this.emitState()
  }

  private attachBarListener(): void {
    this.detachBarListener()
    this.unsubscribeBar = sharedMetronomeEngine.subscribeBar(() => {
      this.handleBarComplete()
    })
    this.unsubscribePulse = sharedMetronomeEngine.subscribePulse((beatIndex) => {
      this.handleConductingPulse(beatIndex)
    })
  }

  private detachBarListener(): void {
    this.unsubscribeBar?.()
    this.unsubscribeBar = null
    this.unsubscribePulse?.()
    this.unsubscribePulse = null
  }

  private handleConductingPulse(beatIndex: number): void {
    if (!this.playing || !this.timeline || this.finished) return
    if (this.countInRemaining > 0) return

    this.conductingBeat = beatIndex + 1
    const section = this.getCurrentSection()
    if (!section) return

    const timing = this.getTimingForCurrentMeasure(section)
    const nextBpm = this.scaledBpm(
      resolveSectionPlaybackBpm(section, this.measure, this.conductingBeat, timing.pulseCount),
    )
    const currentBpm = sharedMetronomeEngine.getSnapshot().bpm
    if (nextBpm === currentBpm) return

    sharedMetronomeEngine.applySectionConfig(
      {
        bpm: nextBpm,
        meter: timing.meter,
        subdivision: timing.subdivision,
        feelId: timing.feelId,
        pulseModeId: timing.pulseModeId,
        accentLevels: timing.accentLevels,
        soundId: section.advanced?.clickSoundId,
      },
      { resetBeat: false },
    )
    this.emitState()
  }

  private emitState(): void {
    this.callbacks.onStateChange?.(this.getState())
  }

  private armCountInForCurrentPosition(context: 'start' | 'jump' | 'loop'): void {
    const section = this.getCurrentSection()
    if (!section || !this.timeline) return

    const settings = trackSettings(this.timeline)
    const sectionCountIn = section.advanced?.countInBars ?? 0
    let bars = sectionCountIn

    if (bars <= 0 && settings.countInBars > 0) {
      if (sectionCountIn === 0) {
        if (context === 'loop' && settings.countInWhen !== 'every-loop') {
          bars = 0
        } else if (context === 'start' && this.sectionIndex !== 0) {
          bars = settings.countInBars
        } else if (context === 'jump') {
          bars = settings.countInBars
        } else if (context === 'start' && this.sectionIndex === 0) {
          bars = settings.countInBars
        } else if (context === 'loop') {
          bars = settings.countInBars
        }
      }
    }

    if (bars <= 0) {
      this.countInRemaining = 0
      return
    }

    this.countInRemaining = bars
    if (this.measure === 1) this.measure = 0
  }

  private applyCurrentSection(options?: { tempoOnly?: boolean; forceResetBeat?: boolean }): void {
    const section = this.getCurrentSection()
    if (!section) return

    const timing = this.getTimingForCurrentMeasure(section)
    const baseBpm = this.baseBpmForCurrentMeasure(section)
    const stepChanged =
      sectionHasMeterPattern(section) &&
      timing.stepIndex !== undefined &&
      this.lastPatternStepIndex !== null &&
      timing.stepIndex !== this.lastPatternStepIndex
    const resetBeat = !options?.tempoOnly && (options?.forceResetBeat || this.measure === 1 || stepChanged)

    if (sectionHasMeterPattern(section) && timing.stepIndex !== undefined) {
      this.lastPatternStepIndex = timing.stepIndex
    } else {
      this.lastPatternStepIndex = null
    }

    sharedMetronomeEngine.applySectionConfig(
      {
        bpm: this.scaledBpm(baseBpm),
        meter: timing.meter,
        subdivision: timing.subdivision,
        feelId: timing.feelId,
        pulseModeId: timing.pulseModeId,
        accentLevels: timing.accentLevels,
        soundId: section.advanced?.clickSoundId,
      },
      { resetBeat },
    )

    if (options?.tempoOnly) return

    this.callbacks.onSectionStart?.(section, this.sectionIndex, this.elapsedSeconds)
  }

  private recordSectionMarker(): void {
    const section = this.getCurrentSection()
    if (!section) return
    const exists = this.markers.some(
      (marker) =>
        marker.sectionId === section.id &&
        marker.timeSeconds === this.recordingOffsetSeconds + this.elapsedSeconds,
    )
    if (exists) return

    this.markers.push({
      sectionId: section.id,
      title: section.title,
      timeSeconds: this.recordingOffsetSeconds + this.elapsedSeconds,
      bars: section.bars,
      meter: section.meter,
      bpm: section.bpm,
    })
  }

  private restartTrack(): void {
    if (!this.timeline) return
    this.sectionIndex = 0
    this.measure = 1
    this.conductingBeat = 1
    this.finished = false
    this.countInRemaining = 0
    this.lastPatternStepIndex = null
    this.applyCurrentSection()
    this.armCountInForCurrentPosition('loop')
    this.recordSectionMarker()
    this.emitState()
  }

  private handleBarComplete(): void {
    if (!this.playing || !this.timeline) return
    if (this.finished) return

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
    const currentTiming = this.getTimingForCurrentMeasure(section)
    const nextMeasure = this.measure + 1

    if (nextMeasure <= totalMeasures) {
      this.measure = nextMeasure
      this.conductingBeat = 1
      const nextTiming = resolveSectionTimingAtMeasure(
        section,
        nextMeasure,
        this.sectionIndex > 0 ? this.timeline.sections[this.sectionIndex - 1] : undefined,
      )
      const stepChanged =
        sectionHasMeterPattern(section) &&
        currentTiming.stepIndex !== undefined &&
        nextTiming.stepIndex !== undefined &&
        currentTiming.stepIndex !== nextTiming.stepIndex

      if (stepChanged && nextTiming.stepIndex !== undefined) {
        this.lastPatternStepIndex = nextTiming.stepIndex
      }

      const baseBpm = resolveSectionPlaybackBpm(
        section,
        this.measure,
        1,
        nextTiming.pulseCount,
      )

      sharedMetronomeEngine.applySectionConfig(
        {
          bpm: this.scaledBpm(baseBpm),
          meter: nextTiming.meter,
          subdivision: nextTiming.subdivision,
          feelId: nextTiming.feelId,
          pulseModeId: nextTiming.pulseModeId,
          accentLevels: nextTiming.accentLevels,
          soundId: section.advanced?.clickSoundId,
        },
        { resetBeat: stepChanged },
      )
      this.emitState()
      return
    }

    this.callbacks.onSectionEnd?.(section, this.sectionIndex, this.elapsedSeconds)

    const nextIndex = this.sectionIndex + 1
    if (nextIndex >= this.timeline.sections.length) {
      const settings = trackSettings(this.timeline)
      if (settings.loopTrack) {
        this.restartTrack()
        return
      }

      this.finished = true
      this.playing = false
      this.detachBarListener()
      sharedMetronomeEngine.stop()
      this.emitState()
      this.callbacks.onFinished?.(this.markers)
      return
    }

    this.sectionIndex = nextIndex
    this.measure = 1
    this.conductingBeat = 1
    this.countInRemaining = 0
    this.lastPatternStepIndex = null
    this.applyCurrentSection()
    this.armCountInForCurrentPosition('loop')
    this.recordSectionMarker()
    this.emitState()
  }
}

export const timelinePlaybackEngine = new TimelinePlaybackEngine()
