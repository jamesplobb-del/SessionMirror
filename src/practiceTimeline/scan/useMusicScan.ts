import { useCallback, useRef, useState } from 'react'
import { analyzeMusicPages } from './musicScanClient'
import { isMusicScanConfigured, resolveMusicScanMode } from './musicScanConfig'
import { fileToScanPages } from './musicScanPdf'
import {
  attachRepeatBlocksToDraft,
  optimizeDraftPatterns,
  parseResultToDraft,
  reconcileMeterAndTempoIntoSections,
  suggestGroupingForDraftSection,
  validateDraftConsistency,
} from './scanToProgram'
import type { MusicScanDraftProgram } from './musicScanTypes'

export type MusicScanPhase = 'idle' | 'reading' | 'analyzing' | 'review' | 'error'

export interface UseMusicScanState {
  phase: MusicScanPhase
  error: string | null
  draft: MusicScanDraftProgram | null
  scanConfigured: boolean
}

export function useMusicScan() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<MusicScanPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<MusicScanDraftProgram | null>(null)
  const [captureMode, setCaptureMode] = useState<'photo' | 'image' | 'pdf' | null>(null)

  const reset = useCallback(() => {
    setPhase('idle')
    setError(null)
    setDraft(null)
    setCaptureMode(null)
  }, [])

  const openPicker = useCallback((mode: 'photo' | 'image' | 'pdf') => {
    setCaptureMode(mode)
    setError(null)
    requestAnimationFrame(() => fileInputRef.current?.click())
  }, [])

  const processFile = useCallback(async (file: File) => {
    setPhase('reading')
    setError(null)

    try {
      const pages = await fileToScanPages(file)
      if (pages.length === 0) {
        throw new Error('No pages could be read from this file')
      }

      setPhase('analyzing')
      const { parseResult, usedDemoParser } = await analyzeMusicPages({
        pages,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
      })

      let       program = parseResultToDraft(parseResult, [
        { name: file.name, mimeType: file.type, pageCount: pages.length },
      ], usedDemoParser)

      program = reconcileMeterAndTempoIntoSections(program)
      program = {
        ...program,
        sections: program.sections.map(suggestGroupingForDraftSection),
      }
      program = attachRepeatBlocksToDraft(program)
      program = optimizeDraftPatterns(program)
      program = validateDraftConsistency(program)

      setDraft(program)
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
      setPhase('error')
    }
  }, [])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      void processFile(file)
    },
    [processFile],
  )

  const updateDraft = useCallback((next: MusicScanDraftProgram) => {
    setDraft(next)
  }, [])

  const inputAccept =
    captureMode === 'pdf'
      ? 'application/pdf'
      : captureMode === 'photo'
        ? 'image/*'
        : 'image/*,application/pdf'

  const inputCapture: 'environment' | undefined = captureMode === 'photo' ? 'environment' : undefined

  return {
    fileInputRef,
    phase,
    error,
    draft,
    scanConfigured: isMusicScanConfigured(),
    scanMode: resolveMusicScanMode(),
    reset,
    openPicker,
    handleFileChange,
    updateDraft,
    inputAccept,
    inputCapture,
  }
}
