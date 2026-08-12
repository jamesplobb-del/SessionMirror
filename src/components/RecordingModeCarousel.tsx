import { useCallback, useEffect, useRef, memo } from 'react'
import { Camera, Mic, Play } from 'lucide-react'
import RecordOrbitIcon from './RecordOrbitIcon'
import {
  triggerLightHaptic,
  triggerModeSwitchHaptic,
  triggerRecordStartHaptic,
  triggerRecordStopHaptic,
} from '../utils/haptics'
import type { RecordingMode } from '../types'
import type { HandsFreePhase } from '../utils/handsFreePhase'
import { useLongPress } from '../hooks/useLongPress'
import { useTutorialAction } from '../context/TutorialContext'

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
  handsFreePhase?: HandsFreePhase
  presentation?: 'carousel' | 'camera' | 'audio'
}

type SlotPosition = 'center' | 'left' | 'right'
export type { HandsFreePhase }

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
  handsFreePhase?: HandsFreePhase
  hapticFeedback?: boolean
  cameraPresentation?: boolean
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
  handsFreePhase,
  hapticFeedback = true,
  cameraPresentation = false,
}: ModeSlotProps) {
  const isCenter = position === 'center'
  const isVideo = mode === 'video'
  const recordStartBlocked = isCenter && isVideo && !ready && !isRecording

  const ariaLabel = isCenter
    ? handsFreePhase === 'playback'
      ? 'Playing back latest take. Long press to turn off hands-free practice.'
      : isRecording
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
    // NOTE: `disabled` here gates BOTH the long-press gesture AND the plain
    // tap (useLongPress's onPointerUp returns early on disabled, before ever
    // calling onClick). It must NOT include `isRecording` — that made the
    // center record button's tap-to-stop silently do nothing while recording.
    // The long-press action (hands-free toggle) already has its own
    // `isRecording` guard in handleRecordLongPress below, so this only needs
    // to gate on whether the slot/long-press affordance exists at all.
    disabled: !isCenter || !onLongPress,
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
      disabled={!isCenter && modeSwitchLocked}
      aria-label={ariaLabel}
      aria-pressed={isCenter}
      data-tutorial-mode={mode}
      {...(isCenter ? { 'data-tutorial': 'record-controls' } : {})}
      onContextMenu={(event) => event.preventDefault()}
      {...buttonHandlers}
      className={`record-carousel-slot pointer-events-auto record-carousel-slot--${position} ${
        isCenter ? 'record-carousel-slot--active' : 'record-carousel-slot--inactive'
      } ${isCenter && isVideo ? 'record-carousel-slot--orbit' : ''} ${
        isCenter && isVideo && !isRecording ? 'record-carousel-slot--video-active' : ''
      } ${isCenter && isRecording ? 'record-carousel-slot--recording' : ''} ${
        longPressActive ? 'record-carousel-slot--hands-free' : ''
      } ${handsFreePhase ? `record-carousel-slot--hands-free-${handsFreePhase}` : ''} ${
        recordStartBlocked ? 'record-carousel-slot--not-ready' : ''
      } ${cameraPresentation ? 'record-carousel-slot--camera' : ''}`}
    >
      {isCenter && handsFreePhase === 'playback' ? (
        <Play className="record-carousel-slot-playback h-5 w-5" fill="currentColor" aria-hidden />
      ) : isCenter && isVideo ? (
        <RecordOrbitIcon recording={isRecording} />
      ) : isCenter && isRecording ? (
        <span
          className="record-carousel-slot-stop block h-3 w-3 rounded-[3px] bg-red-500"
          aria-hidden
        />
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
  handsFreePhase,
  presentation = 'carousel',
}: RecordingModeCarouselProps) {
  const notifyTutorial = useTutorialAction()
  const touchStartXRef = useRef(0)
  const autoSoundRecordingRef = useRef(autoSoundRecording)
  const lastHandsFreeToggleAtRef = useRef(0)
  const modeSwitchLocked = disabled || isRecording

  useEffect(() => {
    autoSoundRecordingRef.current = autoSoundRecording
  }, [autoSoundRecording])

  const handleSlotActivate = useCallback(
    (mode: RecordingMode) => {
      if (mode === value) {
        if (handsFreePhase === 'playback') return
        if (!isRecording && mode === 'video' && !ready) return
        if (isRecording) {
          triggerRecordStopHaptic(hapticFeedback)
        } else {
          triggerRecordStartHaptic(hapticFeedback)
        }
        onToggleRecord()
        if (isRecording && mode === 'video') {
          notifyTutorial?.('camera-take-stopped')
        }
        return
      }
      if (modeSwitchLocked) return
      triggerModeSwitchHaptic(hapticFeedback)
      onChange(mode)
    },
    [
      handsFreePhase,
      hapticFeedback,
      isRecording,
      modeSwitchLocked,
      notifyTutorial,
      onChange,
      onToggleRecord,
      value,
    ]
  )

  const handleRecordLongPress = useCallback(() => {
    if (!onAutoSoundRecordingChange) return
    const now = performance.now()
    if (now - lastHandsFreeToggleAtRef.current < 650) return

    const nextEnabled = !autoSoundRecordingRef.current
    if (isRecording && nextEnabled) return

    lastHandsFreeToggleAtRef.current = now
    // Keep the gesture's source of truth synchronous. A second pointer event
    // can arrive before React commits the new prop on iOS.
    autoSoundRecordingRef.current = nextEnabled
    triggerLightHaptic(hapticFeedback)
    onAutoSoundRecordingChange(nextEnabled)
    notifyTutorial?.(nextEnabled ? 'hands-free-enabled' : 'hands-free-disabled')
  }, [hapticFeedback, isRecording, notifyTutorial, onAutoSoundRecordingChange])

  const handleTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? 0
  }, [])

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (modeSwitchLocked) return

      const endX = event.changedTouches[0]?.clientX ?? 0
      const deltaX = endX - touchStartXRef.current

      if (deltaX <= -SWIPE_THRESHOLD_PX && value === 'video') {
        triggerModeSwitchHaptic(hapticFeedback)
        onChange('audio')
      } else if (deltaX >= SWIPE_THRESHOLD_PX && value === 'audio') {
        triggerModeSwitchHaptic(hapticFeedback)
        onChange('video')
      }
    },
    [hapticFeedback, modeSwitchLocked, onChange, value]
  )

  if (presentation === 'camera') {
    return (
      <div
        className={`record-carousel-viewport record-carousel-viewport--camera ${
          isRecording ? 'record-carousel-viewport--recording' : ''
        } ${modeSwitchLocked ? 'record-carousel-viewport--locked' : ''}`}
        role="group"
        aria-label="Camera recording"
      >
        <div className="record-carousel-track">
          <ModeSlot
            mode="video"
            position="center"
            isRecording={isRecording}
            ready={ready}
            modeSwitchLocked={modeSwitchLocked}
            onActivate={() => handleSlotActivate('video')}
            onLongPress={handleRecordLongPress}
            longPressActive={autoSoundRecording}
            handsFreePhase={handsFreePhase}
            hapticFeedback={hapticFeedback}
            cameraPresentation
          />
        </div>
      </div>
    )
  }

  if (presentation === 'audio') {
    return (
      <div
        className={`record-carousel-viewport record-carousel-viewport--audio-compact ${
          isRecording ? 'record-carousel-viewport--recording' : ''
        } ${modeSwitchLocked ? 'record-carousel-viewport--locked' : ''}`}
        role="group"
        aria-label="Audio recording"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="record-carousel-track">
          <ModeSlot
            mode="audio"
            position="center"
            isRecording={isRecording}
            ready={ready}
            modeSwitchLocked={modeSwitchLocked}
            onActivate={() => handleSlotActivate('audio')}
            onLongPress={handleRecordLongPress}
            longPressActive={autoSoundRecording}
            handsFreePhase={handsFreePhase}
            hapticFeedback={hapticFeedback}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`record-carousel-viewport ${
        isRecording ? 'record-carousel-viewport--recording' : ''
      } ${modeSwitchLocked ? 'record-carousel-viewport--locked' : ''}`}
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
          handsFreePhase={value === 'video' ? handsFreePhase : undefined}
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
          handsFreePhase={value === 'audio' ? handsFreePhase : undefined}
          hapticFeedback={hapticFeedback}
        />
      </div>
    </div>
  )
}

export default memo(RecordingModeCarousel)
