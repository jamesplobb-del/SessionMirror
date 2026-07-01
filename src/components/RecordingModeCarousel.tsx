import { useCallback, useRef, memo } from 'react'
import { Camera, Mic } from 'lucide-react'
import RecordOrbitIcon from './RecordOrbitIcon'
import {
  triggerLightHaptic,
  triggerRecordStartHaptic,
  triggerRecordStopHaptic,
} from '../utils/haptics'
import type { RecordingMode } from '../types'
import { useLongPress } from '../hooks/useLongPress'

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
  hapticFeedback?: boolean
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
  onLongPress?: () => void
  longPressActive?: boolean
  hapticFeedback?: boolean
}

function ModeSlot({
  mode,
  position,
  isRecording,
  ready,
  modeSwitchLocked,
  onActivate,
  onLongPress,
  longPressActive = false,
  hapticFeedback = true,
}: ModeSlotProps) {
  const isCenter = position === 'center'
  const isVideo = mode === 'video'
  const slotDisabled = isCenter ? isVideo && !ready && !isRecording : modeSwitchLocked

  const ariaLabel = isCenter
    ? isRecording
      ? 'Stop recording'
      : isVideo
        ? onLongPress
          ? 'Start video recording. Long press to toggle hands-free practice.'
          : 'Start video recording'
        : onLongPress
          ? 'Start audio recording. Long press to toggle hands-free practice.'
          : 'Start audio recording'
    : isVideo
      ? 'Switch to video mode'
      : 'Switch to audio mode'

  const longPressHandlers = useLongPress({
    onClick: onActivate,
    onLongPress: () => onLongPress?.(),
    disabled: !isCenter || !onLongPress || slotDisabled,
    hapticFeedback,
  })

  const buttonHandlers =
    isCenter && onLongPress
      ? longPressHandlers
      : {
          onClick: onActivate,
        }

  return (
    <button
      type="button"
      disabled={slotDisabled}
      aria-label={ariaLabel}
      aria-pressed={isCenter}
      {...(isCenter ? { 'data-tutorial': 'record-controls' } : {})}
      onContextMenu={(event) => event.preventDefault()}
      {...buttonHandlers}
      className={`record-carousel-slot pointer-events-auto record-carousel-slot--${position} ${
        isCenter ? 'record-carousel-slot--active' : 'record-carousel-slot--inactive'
      } ${isCenter && isVideo ? 'record-carousel-slot--orbit' : ''} ${
        isCenter && isVideo && !isRecording ? 'record-carousel-slot--video-active' : ''} ${
        isCenter && isRecording ? 'record-carousel-slot--recording' : ''
      } ${longPressActive ? 'record-carousel-slot--hands-free' : ''}`}
    >
      {isCenter && isVideo ? (
        <RecordOrbitIcon recording={isRecording} />
      ) : isCenter && isRecording ? (
        <span className="record-carousel-slot-stop block h-3 w-3 rounded-[3px] bg-red-500" aria-hidden />
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
  hapticFeedback = true,
}: RecordingModeCarouselProps) {
  const touchStartXRef = useRef(0)
  const modeSwitchLocked = disabled || isRecording

  const handleSlotActivate = useCallback(
    (mode: RecordingMode) => {
      if (mode === value) {
        if (isRecording) {
          triggerRecordStopHaptic(hapticFeedback)
        } else {
          triggerRecordStartHaptic(hapticFeedback)
        }
        onToggleRecord()
        return
      }
      if (modeSwitchLocked) return
      triggerLightHaptic(hapticFeedback)
      onChange(mode)
    },
    [hapticFeedback, isRecording, modeSwitchLocked, onChange, onToggleRecord, value],
  )

  const handleRecordLongPress = useCallback(() => {
    if (isRecording || !onAutoSoundRecordingChange) return
    triggerLightHaptic(hapticFeedback)
    onAutoSoundRecordingChange(!autoSoundRecording)
  }, [autoSoundRecording, hapticFeedback, isRecording, onAutoSoundRecordingChange])

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? 0
  }, [])

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (modeSwitchLocked) return

      const endX = event.changedTouches[0]?.clientX ?? 0
      const deltaX = endX - touchStartXRef.current

      if (deltaX <= -SWIPE_THRESHOLD_PX && value === 'video') {
        triggerLightHaptic(hapticFeedback)
        onChange('audio')
      } else if (deltaX >= SWIPE_THRESHOLD_PX && value === 'audio') {
        triggerLightHaptic(hapticFeedback)
        onChange('video')
      }
    },
    [hapticFeedback, modeSwitchLocked, onChange, value],
  )

  return (
    <div
      className={`record-carousel-viewport ${isRecording ? 'record-carousel-viewport--recording' : ''} ${modeSwitchLocked ? 'record-carousel-viewport--locked' : ''}`}
      role="group"
      aria-label="Recording mode"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="record-carousel-track">
        <ModeSlot
          mode="video"
          position={slotPosition('video', value)}
          isRecording={isRecording && value === 'video'}
          ready={ready}
          modeSwitchLocked={modeSwitchLocked}
          onActivate={() => handleSlotActivate('video')}
          onLongPress={value === 'video' ? handleRecordLongPress : undefined}
          longPressActive={value === 'video' && autoSoundRecording}
          hapticFeedback={hapticFeedback}
        />
        <ModeSlot
          mode="audio"
          position={slotPosition('audio', value)}
          isRecording={isRecording && value === 'audio'}
          ready={ready}
          modeSwitchLocked={modeSwitchLocked}
          onActivate={() => handleSlotActivate('audio')}
          onLongPress={value === 'audio' ? handleRecordLongPress : undefined}
          longPressActive={value === 'audio' && autoSoundRecording}
          hapticFeedback={hapticFeedback}
        />
      </div>
    </div>
  )
}

export default memo(RecordingModeCarousel)
