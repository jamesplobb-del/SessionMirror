import { useEffect, useMemo, useRef, useState } from 'react'
import {
  listPitchObservations,
  PITCH_INSIGHTS_UPDATED_EVENT,
  type PitchInsightsUpdatedDetail,
  type PitchObservation,
} from '../db/pitchInsightsRepository'
import {
  aggregatePitchInsights,
  describeLivePitchCoach,
  pitchClassFromNoteName,
  type NotePitchInsight,
} from '../utils/pitchInsightsAnalytics'
import type { TunerTranspositionId } from '../utils/tunerTransposition'

/** Wait until the live note has settled before speaking. Hunting should stay quiet. */
const LIVE_COACH_HOLD_MS = 560

export function useLivePitchCoach({
  enabled,
  concertMidi,
  writtenNoteName,
  transpositionId,
  suppressed,
}: {
  enabled: boolean
  concertMidi: number | null
  writtenNoteName: string
  transpositionId: TunerTranspositionId
  suppressed: boolean
}): string | null {
  const [observations, setObservations] = useState<PitchObservation[]>([])
  const [holdReady, setHoldReady] = useState(false)
  const activeRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false
      setObservations([])
      setHoldReady(false)
      return
    }

    activeRef.current = true
    let cancelled = false

    const load = async () => {
      try {
        const rows = await listPitchObservations({ transpositionId })
        if (!cancelled && activeRef.current) setObservations(rows)
      } catch (error) {
        console.warn('[LivePitchCoach] Failed to load pitch history', error)
      }
    }

    void load()

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent<PitchInsightsUpdatedDetail>).detail
      if (!activeRef.current) return

      if (detail?.kind === 'saved') {
        if (detail.observation.transpositionId !== transpositionId) return
        setObservations((current) => {
          if (current.some((observation) => observation.id === detail.observation.id)) {
            return current
          }
          return [detail.observation, ...current]
        })
        return
      }

      if (detail?.kind === 'cleared') {
        setObservations([])
        return
      }

      if (detail?.kind === 'range-deleted') {
        setObservations((current) =>
          current.filter(
            (observation) =>
              observation.observedAt < detail.startAt ||
              observation.observedAt >= detail.endAt,
          ),
        )
        return
      }

      void load()
    }

    window.addEventListener(PITCH_INSIGHTS_UPDATED_EVENT, handleUpdate)
    return () => {
      cancelled = true
      activeRef.current = false
      window.removeEventListener(PITCH_INSIGHTS_UPDATED_EVENT, handleUpdate)
    }
  }, [enabled, transpositionId])

  useEffect(() => {
    if (!enabled || suppressed || concertMidi == null) {
      setHoldReady(false)
      return
    }

    setHoldReady(false)
    const timer = window.setTimeout(() => setHoldReady(true), LIVE_COACH_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [concertMidi, enabled, suppressed])

  const insightByMidi = useMemo(() => {
    const map = new Map<number, NotePitchInsight>()
    for (const insight of aggregatePitchInsights(observations)) {
      map.set(insight.midiNote, insight)
    }
    return map
  }, [observations])

  if (!enabled || suppressed || !holdReady || concertMidi == null) return null

  const insight = insightByMidi.get(Math.round(concertMidi))
  if (!insight) return null

  return describeLivePitchCoach(insight, pitchClassFromNoteName(writtenNoteName))
}
