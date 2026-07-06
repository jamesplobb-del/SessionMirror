import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { FolderOpen, Trash2, Volume2 } from 'lucide-react'
import Pressable from '../ui/Pressable'
import { useMediaWaveform } from '../../hooks/useMediaWaveform'
import { formatTime } from '../../hooks/useVideoPlayback'
import type { CreatorStudioAudioSource, CreatorStudioEditorState } from '../../creatorStudio/types'

const AUDIO_SOURCES: Array<{ id: CreatorStudioAudioSource; label: string }> = [
  { id: 'original', label: 'Original audio' },
  { id: 'mute', label: 'Mute' },
]

const BACKING_ACCEPT = 'audio/mpeg,audio/wav,audio/x-wav,audio/aac,audio/mp4,audio/x-m4a,.mp3,.wav,.aac,.m4a'

interface CreatorStudioAudioPanelProps {
  editorState: CreatorStudioEditorState
  backingSrc: string | null
  backingDuration: number
  backingPlayheadPercent: number
  onSourceChange: (source: CreatorStudioAudioSource) => void
  onInstrumentVolumeChange: (volume: number) => void
  onBackingVolumeChange: (volume: number) => void
  onSyncOffsetChange: (offsetMs: number) => void
  onImportBacking: (file: File) => void
  onRemoveBacking: () => void
  onBackingTrimChange: (edge: 'start' | 'end', percent: number) => void
  onBackingSeek: (percent: number) => void
}

export default function CreatorStudioAudioPanel({
  editorState,
  backingSrc,
  backingDuration,
  backingPlayheadPercent,
  onSourceChange,
  onInstrumentVolumeChange,
  onBackingVolumeChange,
  onSyncOffsetChange,
  onImportBacking,
  onRemoveBacking,
  onBackingTrimChange,
  onBackingSeek,
}: CreatorStudioAudioPanelProps) {
  const backingInputRef = useRef<HTMLInputElement>(null)
  const backingTrimRef = useRef<HTMLDivElement>(null)
  const backingTrack = editorState.audio.backingTrack

  const backingPeaks = useMediaWaveform({
    filePath: '',
    mediaUrl: backingSrc ?? '',
    barCount: 48,
  })

  const updateBackingTrimFromClientX = useCallback(
    (edge: 'start' | 'end', clientX: number) => {
      const rail = backingTrimRef.current
      if (!rail || !backingTrack) return
      const rect = rail.getBoundingClientRect()
      const percent = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
      onBackingTrimChange(edge, percent)
    },
    [backingTrack, onBackingTrimChange],
  )

  const handleBackingTrimPointerDown = useCallback(
    (edge: 'start' | 'end', event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const handle = event.currentTarget
      handle.setPointerCapture(event.pointerId)
      updateBackingTrimFromClientX(edge, event.clientX)

      const onMove = (moveEvent: PointerEvent) => {
        if (!handle.hasPointerCapture(moveEvent.pointerId)) return
        updateBackingTrimFromClientX(edge, moveEvent.clientX)
      }
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove)
        handle.removeEventListener('pointerup', onUp)
      }
      handle.addEventListener('pointermove', onMove)
      handle.addEventListener('pointerup', onUp)
    },
    [updateBackingTrimFromClientX],
  )

  const backingTrimStart = backingTrack?.trim.start ?? 0
  const backingTrimEnd = backingTrack?.trim.end ?? 100

  return (
    <div className="creator-studio__panel-content">
      <div className="creator-studio__panel-heading">
        <div className="creator-studio__panel-icon creator-studio__panel-icon--blue">
          <Volume2 className="h-4 w-4" />
        </div>
        <div>
          <h3>Audio</h3>
          <p>Mix instrument audio with an optional imported backing track.</p>
        </div>
      </div>

      <div className="creator-studio__choice-list">
        {AUDIO_SOURCES.map((source) => (
          <Pressable
            key={source.id}
            type="button"
            intensity="soft"
            haptic="light"
            className={`creator-studio__choice creator-studio__choice--wide ${
              editorState.audio.source === source.id ? 'is-selected' : ''
            }`}
            onClick={() => onSourceChange(source.id)}
          >
            {source.label}
          </Pressable>
        ))}
      </div>

      <div className="creator-studio__range-row">
        <label>
          <span>Instrument volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={editorState.audio.instrumentVolume}
            disabled={editorState.audio.source === 'mute'}
            onChange={(event) => onInstrumentVolumeChange(Number(event.target.value))}
          />
          <em>{editorState.audio.instrumentVolume}%</em>
        </label>
        <label>
          <span>Backing track volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={editorState.audio.backingTrackVolume}
            disabled={!backingTrack || editorState.audio.source === 'mute'}
            onChange={(event) => onBackingVolumeChange(Number(event.target.value))}
          />
          <em>{editorState.audio.backingTrackVolume}%</em>
        </label>
      </div>

      <div className="creator-studio__audio-import">
        <p className="creator-studio__detail-label">Backing track</p>
        {backingTrack ? (
          <div className="creator-studio__backing-card">
            <div>
              <strong>{backingTrack.name}</strong>
              <span>Sync {backingTrack.syncOffsetMs > 0 ? '+' : ''}{backingTrack.syncOffsetMs} ms</span>
            </div>
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              className="creator-studio__icon-button"
              aria-label="Remove backing track"
              onClick={onRemoveBacking}
            >
              <Trash2 className="h-4 w-4" />
            </Pressable>
          </div>
        ) : (
          <p className="creator-studio__hint">Import MP3, WAV, AAC, or M4A from Files.</p>
        )}

        <input
          ref={backingInputRef}
          type="file"
          className="hidden"
          accept={BACKING_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onImportBacking(file)
            event.currentTarget.value = ''
          }}
        />
        <Pressable
          type="button"
          intensity="soft"
          haptic="light"
          className="creator-studio__import-button"
          onClick={() => backingInputRef.current?.click()}
        >
          <FolderOpen className="h-4 w-4" />
          Import from Files
        </Pressable>
      </div>

      {backingTrack && (
        <>
          <label className="creator-studio__range-row">
            <span>Sync offset (ms)</span>
            <input
              type="range"
              min={-2000}
              max={2000}
              step={10}
              value={backingTrack.syncOffsetMs}
              onChange={(event) => onSyncOffsetChange(Number(event.target.value))}
            />
            <em>{backingTrack.syncOffsetMs} ms</em>
          </label>

          <div className="creator-studio__trim-editor">
            <p className="creator-studio__detail-label">Backing track trim</p>
            <div
              ref={backingTrimRef}
              className="creator-studio__trim-rail"
              onPointerDown={(event) => {
                if ((event.target as HTMLElement).closest('.creator-studio__trim-handle')) return
                const rect = event.currentTarget.getBoundingClientRect()
                const percent = ((event.clientX - rect.left) / rect.width) * 100
                onBackingSeek(percent)
              }}
            >
              <div className="creator-studio__trim-waveform" aria-hidden>
                {backingPeaks.map((peak, index) => (
                  <span key={index} style={{ height: `${Math.round(peak * 100)}%` }} />
                ))}
              </div>
              <div
                className="creator-studio__trim-dim creator-studio__trim-dim--left"
                style={{ width: `${backingTrimStart}%` }}
              />
              <div
                className="creator-studio__trim-dim creator-studio__trim-dim--right"
                style={{ width: `${100 - backingTrimEnd}%` }}
              />
              <div
                className="creator-studio__trim-selection"
                style={{ left: `${backingTrimStart}%`, width: `${backingTrimEnd - backingTrimStart}%` }}
              />
              <div
                className="creator-studio__trim-playhead"
                style={{ left: `${backingPlayheadPercent}%` }}
              />
              <button
                type="button"
                className="creator-studio__trim-handle creator-studio__trim-handle--start"
                style={{ left: `${backingTrimStart}%` }}
                aria-label="Backing trim start"
                onPointerDown={(event) => handleBackingTrimPointerDown('start', event)}
              />
              <button
                type="button"
                className="creator-studio__trim-handle creator-studio__trim-handle--end"
                style={{ left: `${backingTrimEnd}%` }}
                aria-label="Backing trim end"
                onPointerDown={(event) => handleBackingTrimPointerDown('end', event)}
              />
            </div>
            <div className="creator-studio__trim-meta">
              <span>
                <strong>Start</strong> {formatTime((backingDuration * backingTrimStart) / 100)}
              </span>
              <span className="creator-studio__trim-duration">
                {formatTime((backingDuration * (backingTrimEnd - backingTrimStart)) / 100)} selected
              </span>
              <span>
                <strong>End</strong>{' '}
                {backingTrack.trim.end === null
                  ? formatTime(backingDuration)
                  : formatTime((backingDuration * backingTrimEnd) / 100)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
