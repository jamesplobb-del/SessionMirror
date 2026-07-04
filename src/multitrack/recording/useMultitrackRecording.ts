import { useCallback, useRef, useState } from 'react'
import type { MultitrackRecordingPhase } from '../types'

export function useMultitrackRecording(options: {
  onCountInComplete: (panelId: string) => void
  onSyncPlaybackBeforeRecord?: () => Promise<void>
}) {
  const { onCountInComplete, onSyncPlaybackBeforeRecord } = options
  const [phase, setPhase] = useState<MultitrackRecordingPhase>('idle')
  const [targetPanelId, setTargetPanelId] = useState<string | null>(null)
  const activeRef = useRef(false)

  const cancel = useCallback(() => { activeRef.current = false; setPhase('idle'); setTargetPanelId(null) }, [])

  const beginCountIn = useCallback((panelId: string) => {
    if (activeRef.current) return
    activeRef.current = true
    setTargetPanelId(panelId)
    setPhase('count-in')
    void (async () => {
      await onSyncPlaybackBeforeRecord?.()
      await new Promise((r) => setTimeout(r, 2000))
      if (!activeRef.current) return
      setPhase('recording')
      onCountInComplete(panelId)
    })()
  }, [onCountInComplete, onSyncPlaybackBeforeRecord])

  return { phase, targetPanelId, beginCountIn, cancel }
}
