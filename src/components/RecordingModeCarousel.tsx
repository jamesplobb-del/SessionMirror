import { useCallback, useRef, memo } from 'react'
import { Camera, Mic, Square, AudioWaveform } from 'lucide-react'
import { triggerLightHaptic, triggerMediumHaptic } from '../utils/haptics'
import { stopEventBubble } from '../utils/eventBubbling'
import type { RecordingMode } from '../types'

const SWIPE_THRESHOLD_PX = 36

interface RecordingModeCarouselProps {
  value: RecordingMode
  onChange: (mode: RecordingMode) => void
  onToggleRecord: () => void
  isRecording: boolean
  ready: boolean
  disabled?: boolean
  autoSoundRecording?: boolean
  onAutoSoundRecordingChange?: (enabled: boolean) => void
}

type SlotPosition = 'center' | 'left' | 'right'

function slotPosition(mode: RecordingMode, active: RecordingMode): SlotPosition {
  if (mode === active) return 'center'
  return mode === 'video' ? 'left' : 'right'
}

interface ModeSlotProps {
  mode: RecordingMode
  position: SlotPosition
  isRecording: boolean
  ready: boolean
  modeSwitchLocked: boolean
  onActivate: () => void
}

function ModeSlot({
  mode,
  position,
  isRecording,
  ready,
  modeSwitchLocked,
  onActivate,
}: ModeSlotProps) {
  const isCenter = position === 'center'
  const isVideo = mode === 'video'
  const slotDisabled = isCenter ? !ready && !isRecording : modeSwitchLocked

  const ariaLabel = isCenter
    ? isRecording
      ? 'Stop recording'
      : isVideo
        ? 'Start video recording'
        : 'Start audio recording'
    : isVideo
      ? 'Switch to video mode'
      : 'Switch to audio mode'

  return (
    <button
      type="button"
      disabled={slotDisabled}
      aria-label={ariaLabel}
      aria-pressed={isCenter}
      {...(isCenter ? { 'data-tutorial': 'record-controls' } : {})}
      onClick={onActivate}
      className={`record-carousel-slot pointer-events-auto record-carousel-slot--${position} ${
        isCenter ? 'record-carousel-slot--active' : 'record-carousel-slot--inactive'
      } ${isCenter && isVideo && !isRecording ? 'record-carousel-slot--video-active' : ''} ${
        isCenter && isRecording ? 'record-carousel-slot--recording' : ''
      }`}
    >
      {isCenter && isRecording ? (
        <Square className="h-5 w-5 fill-red-500 text-red-500" />
      ) : isCenter && isVideo ? (
        <span className="record-carousel-slot-dot block rounded-full bg-red-500" aria-hidden />
      ) : isCenter ? (
        <Mic className="h-5 w-5 text-white" strokeWidth={2.25} />
      ) : isVideo ? (
        <Camera className="h-4 w-4 text-white" strokeWidth={2} />
      ) : (
        <Mic className="h-4 w-4 text-white" strokeWidth={2} />
      )}
    </button>
  )
}

function RecordingModeCarousel({
  value,
  onChange,
  onToggleRecord,
  isRecording,
  ready,
  disabled = false,
  autoSoundRecording = false,
  onAutoSoundRecordingChange,
}: RecordingModeCarouselProps) {
  const touchStartXRef = useRef(0)
  const modeSwitchLocked = disabled || isRecording

  const handleSlotActivate = useCallback(
    (mode: RecordingMode) => {
      if (mode === value) {
        triggerMediumHaptic()
        onToggleRecord()
        return
      }
      if (modeSwitchLocked) return
      triggerLightHaptic()
      onChange(mode)
    },
    [modeSwitchLocked, onChange, onToggleRecord, value],
  )

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? 0
  }, [])

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (modeSwitchLocked) return

      const endX = event.changedTouches[0]?.clientX ?? 0
      const deltaX = endX - touchStartXRef.current

      if (deltaX <= -SWIPE_THRESHOLD_PX && value === 'video') {
        onChange('audio')
      } else if (deltaX >= SWIPE_THRESHOLD_PX && value === 'audio') {
        onChange('video')
      }
    },
    [modeSwitchLocked, onChange, value],
  )

  return (
    <div
      className={`record-carousel-viewport ${isRecording ? 'record-carousel-viewport--recording' : ''} ${modeSwitchLocked ? 'record-carousel-viewport--locked' : ''}`}
      role="group"
      aria-label="Recording mode"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {value === 'audio' && !isRecording && onAutoSoundRecordingChange && (
        <button
          type="button"
          data-tutorial="auto-record-toggle"
          className={`record-carousel-auto-btn ${autoSoundRecording ? 'record-carousel-auto-btn--active' : ''}`}
          aria-label={
            autoSoundRecording
              ? 'Turn off auto sound recording'
              : 'Turn on auto sound recording'
          }
          aria-pressed={autoSoundRecording}
          onPointerDown={stopEventBubble}
          onTouchStart={stopEventBubble}
          onTouchEnd={stopEventBubble}
          onClick={(event) => {
            stopEventBubble(event)
            triggerLightHaptic()
            onAutoSoundRecordingChange(!autoSoundRecording)
          }}
        >
          <AudioWaveform className="h-4 w-4" strokeWidth={2.25} />
        </button>
      )}
      <div className="record-carousel-track">
        <ModeSlot
          mode="video"
          position={slotPosition('video', value)}
          isRecording={isRecording && value === 'video'}
          ready={ready}
          modeSwitchLocked={modeSwitchLocked}
          onActivate={() => handleSlotActivate('video')}
        />
        <ModeSlot
          mode="audio"
          position={slotPosition('audio', value)}
          isRecording={isRecording && value === 'audio'}
          ready={ready}
          modeSwitchLocked={modeSwitchLocked}
          onActivate={() => handleSlotActivate('audio')}
        />
      </div>
    </div>
  )
}

export default memo(RecordingModeCarousel)
