import { useEffect, useState } from 'react'
import type { Take } from '../types'
import {
  analyzeTakePitch,
  type TakePitchAnalysis,
} from '../utils/pitchExtractor'

export type PitchAnalysisStatus = 'idle' | 'loading' | 'ready' | 'error'

interface UseTakePitchAnalysisResult {
  status: PitchAnalysisStatus
  analysis: TakePitchAnalysis | null
  progress: number
  error: string | null
}

export function useTakePitchAnalysis(
  take: Take | null,
  enabled: boolean,
): UseTakePitchAnalysisResult {
  const [status, setStatus] = useState<PitchAnalysisStatus>('idle')
  const [analysis, setAnalysis] = useState<TakePitchAnalysis | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !take?.videoUrl) {
      setStatus('idle')
      setAnalysis(null)
      setProgress(0)
      setError(null)
      return
    }

    let cancelled = false
    setStatus('loading')
    setAnalysis(null)
    setProgress(0)
    setError(null)

    void analyzeTakePitch(
      take.id,
      take.filePath,
      take.videoUrl,
      (nextProgress) => {
        if (!cancelled) setProgress(nextProgress)
      },
    )
      .then((result) => {
        if (cancelled) return
        setAnalysis(result)
        setStatus('ready')
        setProgress(1)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(
          reason instanceof Error ? reason.message : 'Pitch analysis failed',
        )
      })

    return () => {
      cancelled = true
    }
  }, [enabled, take?.id, take?.filePath, take?.videoUrl])

  return { status, analysis, progress, error }
}
