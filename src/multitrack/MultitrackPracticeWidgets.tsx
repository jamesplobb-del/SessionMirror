import { useRef, type RefObject } from 'react'
import DraggableMetronomeWidget from '../components/DraggableMetronomeWidget'
import DraggablePitchWidget from '../components/DraggablePitchWidget'
import DroneKeyboard from '../components/audioPractice/DroneKeyboard'
import Pressable from '../components/ui/Pressable'
import { useDrone } from '../hooks/useDrone'
import type { AppSettings } from '../utils/appSettings'
import type { TunerInstrument } from '../utils/pitchConfig'
import type { MultitrackWidgetVisibility } from './types'
import { clampWidgetPosition, saveWidgetPosition } from '../utils/floatingWidgetLayout'
import { motion, useMotionValue } from 'framer-motion'

interface MultitrackPracticeWidgetsProps {
  boundaryRef: RefObject<HTMLElement | null>
  settings: AppSettings
  tunerInstrument: TunerInstrument
  micStreamRef: RefObject<MediaStream | null>
  backingMediaRef: RefObject<HTMLAudioElement | null>
  isPlaying: boolean
  widgets: MultitrackWidgetVisibility
  onWidgetsChange: (patch: Partial<MultitrackWidgetVisibility>) => void
  droneMixerLevel: number
}

function DraggableDroneWidget({
  boundaryRef,
  settings,
  droneMixerLevel,
}: {
  boundaryRef: RefObject<HTMLElement | null>
  settings: AppSettings
  droneMixerLevel: number
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  const dragX = useMotionValue(0)
  const dragY = useMotionValue(0)
  const scaledVolume = Math.round((settings.droneVolume * droneMixerLevel) / 100)

  const drone = useDrone({
    volume: scaledVolume,
    waveform: settings.droneWaveform,
    hapticFeedback: settings.hapticFeedback,
  })

  return (
    <motion.div
      ref={shellRef}
      className="multitrack-widget multitrack-widget--drone"
      drag
      dragMomentum={false}
      dragElastic={0}
      style={{ x: dragX, y: dragY, touchAction: 'none' }}
      onDragEnd={() => {
        const bounds = boundaryRef.current?.getBoundingClientRect()
        const widget = shellRef.current?.getBoundingClientRect()
        if (!bounds || !widget) return
        const next = clampWidgetPosition(
          bounds.width,
          bounds.height,
          widget.width,
          widget.height,
          widget.left - bounds.left,
          widget.top - bounds.top,
        )
        saveWidgetPosition('multitrack-drone', next.x, next.y)
        dragX.set(0)
        dragY.set(0)
      }}
    >
      <DroneKeyboard
        activeNotes={drone.activeNotes}
        octave={drone.octave}
        onToggleNote={drone.toggleNote}
        onIncrementOctave={drone.incrementOctave}
        onDecrementOctave={drone.decrementOctave}
      />
    </motion.div>
  )
}

export default function MultitrackPracticeWidgets({
  boundaryRef,
  settings,
  tunerInstrument,
  micStreamRef,
  backingMediaRef,
  isPlaying,
  widgets,
  onWidgetsChange,
  droneMixerLevel,
}: MultitrackPracticeWidgetsProps) {
  return (
    <section className="multitrack-widgets-panel">
      <h3 className="multitrack-widgets-panel__title">Practice widgets</h3>
      <div className="multitrack-widgets-panel__toggles">
        {(
          [
            ['metronome', 'Metronome'],
            ['pitch', 'Pitch analysis'],
            ['drone', 'Drone'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            type="button"
            intensity="soft"
            className={widgets[key] ? 'multitrack-widgets-panel__toggle--on' : ''}
            onClick={() => onWidgetsChange({ [key]: !widgets[key] })}
          >
            {label}
          </Pressable>
        ))}
      </div>

      {widgets.metronome ? (
        <DraggableMetronomeWidget
          boundaryRef={boundaryRef}
          positionId="multitrack-metronome"
          isTakePlaying={isPlaying}
          muteDuringPlayback={false}
          onClose={() => onWidgetsChange({ metronome: false })}
        />
      ) : null}

      {widgets.pitch ? (
        <DraggablePitchWidget
          boundaryRef={boundaryRef}
          positionId="multitrack-pitch"
          mediaRef={backingMediaRef}
          isPlaying={isPlaying}
          mediaKey="multitrack-backing"
          tunerInstrument={tunerInstrument}
          pitchSource="microphone"
          liveMicEnabled
          micStreamRef={micStreamRef}
          layoutRegion="main"
          onClose={() => onWidgetsChange({ pitch: false })}
        />
      ) : null}

      {widgets.drone ? (
        <DraggableDroneWidget
          boundaryRef={boundaryRef}
          settings={settings}
          droneMixerLevel={droneMixerLevel}
        />
      ) : null}
    </section>
  )
}
