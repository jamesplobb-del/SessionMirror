import { Camera, FileImage, FileText, Loader2, ScanLine, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import AnimatedBottomSheet from '../../components/ui/AnimatedBottomSheet'
import Pressable from '../../components/ui/Pressable'
import { isMusicScanConfigured, musicScanSetupNotice, resolveMusicScanMode } from '../scan/musicScanConfig'
import type { MusicScanPhase } from '../scan/useMusicScan'

interface MusicScanCaptureSheetProps {
  open: boolean
  phase: MusicScanPhase
  error: string | null
  onClose: () => void
  onTakePhoto: () => void
  onImportImage: () => void
  onImportPdf: () => void
}

function MusicScanBusyOverlay({
  phase,
  setupNotice,
  configured,
}: {
  phase: MusicScanPhase
  setupNotice: string
  configured: boolean
}) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="music-scan-fullscreen pointer-events-auto" role="dialog" aria-modal="true" aria-label="Scanning sheet music">
      <div className="music-scan-fullscreen__content">
        <Loader2 className="music-scan-capture__spinner" size={36} aria-hidden />
        <p className="music-scan-fullscreen__status">
          {phase === 'reading' ? 'Reading pages…' : 'Analyzing with vision AI…'}
        </p>
        <p
          className={`music-scan-capture__notice ${configured ? 'music-scan-capture__notice--ok' : ''}`}
        >
          {setupNotice}
        </p>
      </div>
    </div>,
    document.body,
  )
}

export default function MusicScanCaptureSheet({
  open,
  phase,
  error,
  onClose,
  onTakePhoto,
  onImportImage,
  onImportPdf,
}: MusicScanCaptureSheetProps) {
  const busy = phase === 'reading' || phase === 'analyzing'
  const scanMode = resolveMusicScanMode()
  const setupNotice = musicScanSetupNotice()
  const configured = isMusicScanConfigured()

  if (busy && open) {
    return <MusicScanBusyOverlay phase={phase} setupNotice={setupNotice} configured={configured} />
  }

  return (
    <AnimatedBottomSheet
      isOpen={open}
      onClose={onClose}
      ariaLabel="Scan Music"
      vaultTheme
      elevated
    >
      <div className="music-scan-capture pointer-events-auto px-4 pb-4 pt-1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--audio-text-primary)]">Scan Music</h2>
          <Pressable type="button" intensity="icon" onClick={onClose} aria-label="Close">
            <X size={22} />
          </Pressable>
        </div>

        <p className="music-scan-capture__lead">
          Take a photo or import sheet music. We&apos;ll draft a metronome program you can review and
          edit before applying.
        </p>

        {scanMode === 'demo' ? (
          <p className="music-scan-capture__notice">
            {setupNotice}
            {' '}
            Open Settings → Music Scan, turn on Dev Mode, and paste your OpenAI API key.
          </p>
        ) : (
          <p className="music-scan-capture__notice music-scan-capture__notice--ok">{setupNotice}</p>
        )}

        <div className="music-scan-capture__options">
          <Pressable
            type="button"
            intensity="soft"
            className="music-scan-capture__option"
            onClick={onTakePhoto}
          >
            <Camera size={22} aria-hidden />
            <span>Take Photo</span>
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            className="music-scan-capture__option"
            onClick={onImportImage}
          >
            <FileImage size={22} aria-hidden />
            <span>Import Image</span>
          </Pressable>
          <Pressable
            type="button"
            intensity="soft"
            className="music-scan-capture__option"
            onClick={onImportPdf}
          >
            <FileText size={22} aria-hidden />
            <span>Import PDF</span>
          </Pressable>
        </div>

        {error ? <p className="music-scan-capture__error">{error}</p> : null}

        <p className="music-scan-capture__fine-print">
          <ScanLine size={14} className="mr-1 inline" aria-hidden />
          Scan results are drafts — always review before applying.
        </p>
      </div>
    </AnimatedBottomSheet>
  )
}
