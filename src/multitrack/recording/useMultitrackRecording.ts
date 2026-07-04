import { useCallback, useRef, useState } from 'react'
import { sharedMetronomeEngine } from '../../metronome/sharedMetronomeEngine'
import type { MultitrackRecordingPhase } from '../types'

export function useMultitrackRecording(options: {
  onCountInComplete: (panelId: string) => void
  onSyncPlaybackBeforeRecord?: () => Promise<void>
}) {
  const { onCountInComplete, onSyncPlaybackBeforeRecord } = options
  const [phase, setPhase] = useState<MultitrackRecordingPhase>('idle')
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null)
  const [countInRemaining, setCountInRemaining] = useState(0)
  const activeRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    activeRef.current = false
    clearTimer()
    sharedMetronomeEngine.stop()
    setCountInRemaining(0)
    setPhase('idle')
    setTargetPanelId(null)
  }, [clearTimer])

  const beginCountIn = useCallback((panelId: string, settings?: {
    bpm?: number
    countInBars?: number
    clickEnabled?: boolean
  }) => {
    if (activeRef.current) return
    const bpm = Math.max(40, Math.min(300, Math.round(settings?.bpm ?? 120)))
    const countInBars = Math.max(0, Math.min(8, Math.round(settings?.countInBars ?? 1)))
    const countInBeats = countInBars * 4
    const beatMs = 60_000 / bpm

    activeRef.current = true
    setTargetPanelId(panelId)
    setCountInRemaining(countInBeats)
    setPhase(countInBeats > 0 ? 'count-in' : 'recording')

    void (async () => {
      if (settings?.clickEnabled !== false) {
        sharedMetronomeEngine.applySectionConfig(
          {
            bpm,
            meter: '4/4',
            subdivision: 'off',
            pulseModeId: 'default',
            accentLevels: ['strong', 'weak', 'weak', 'weak'],
          },
          { resetBeat: true },
        )
        await sharedMetronomeEngine.start()
      }

      for (let beat = countInBeats; beat > 0; beat -= 1) {
        if (!activeRef.current) return
        setCountInRemaining(beat)
        await new Promise((resolve) => {
          timerRef.current = window.setTimeout(resolve, beatMs)
        })
      }

      if (!activeRef.current) return
      setCountInRemaining(0)
      await onSyncPlaybackBeforeRecord?.()
      if (!activeRef.current) return
      setPhase('recording')
      onCountInComplete(panelId)
    })()
  }, [onCountInComplete, onSyncPlaybackBeforeRecord])

  return { phase, targetPanelId, countInRemaining, beginCountIn, cancel }
}
