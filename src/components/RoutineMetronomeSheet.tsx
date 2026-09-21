import { useEffect, useRef } from 'react'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import AudioPracticeMetronomeView from './audioPractice/AudioPracticeMetronomeView'
import { sharedMetronomeEngine } from '../metronome/sharedMetronomeEngine'
import { normalizeDeskMetronome } from '../utils/deskMetronome'
import type { MetronomePrefs } from '../utils/metronomeConfig'

/** The hub layer sits at z-index 95; this has to clear it, backdrop included. */
const ROUTINE_METRONOME_SHEET_Z = { backdrop: 'z-[115]', sheet: 'z-[120]' }

function readEngine(): MetronomePrefs {
  const snapshot = sharedMetronomeEngine.getSnapshot()
  return normalizeDeskMetronome({
    bpm: snapshot.bpm,
    meter: snapshot.meter,
    subdivision: snapshot.subdivision,
    pulseModeId: snapshot.pulseModeId,
    feelId: snapshot.feelId,
    accentLevels: snapshot.accentLevels,
    soundId: snapshot.soundId,
  })
}

/** Order matters: meter resets the pulse, which resets feel and subdivision. */
function writeEngine(prefs: MetronomePrefs): void {
  sharedMetronomeEngine.setMeter(prefs.meter)
  if (prefs.pulseModeId) sharedMetronomeEngine.setPulseMode(prefs.pulseModeId)
  if (prefs.feelId) sharedMetronomeEngine.setFeel(prefs.feelId)
  sharedMetronomeEngine.setSubdivision(prefs.subdivision)
  sharedMetronomeEngine.setAccentLevels(prefs.accentLevels)
  sharedMetronomeEngine.setSoundId(prefs.soundId)
  sharedMetronomeEngine.setBpm(prefs.bpm)
}

/**
 * The real metronome, opened to set one routine item's click.
 *
 * It drives the shared engine rather than a private copy so the tempo can be
 * heard while it is chosen — picking a tempo silently is guesswork for a
 * player. The engine is the workspace's own metronome, so whatever it was set
 * to is put back on the way out and only Save copies the settings onto the
 * step.
 */
export default function RoutineMetronomeSheet({ isOpen, value, onSave, onClose }: {
  isOpen: boolean
  value: MetronomePrefs
  onSave: (prefs: MetronomePrefs) => void
  onClose: () => void
}) {
  const restoreRef = useRef<MetronomePrefs | null>(null)
  const savedRef = useRef<MetronomePrefs | null>(null)
  // Read through a ref: reopening must seed from the step, but a re-render
  // while the sheet is up must not yank the engine back mid-edit.
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (!isOpen) return
    restoreRef.current = readEngine()
    savedRef.current = null
    sharedMetronomeEngine.stop()
    writeEngine(normalizeDeskMetronome(valueRef.current))

    return () => {
      // Silence first: the settings being put back belong to the workspace, and
      // a click left running here would be this item's tempo, not the room's.
      sharedMetronomeEngine.stop()
      const restore = restoreRef.current
      restoreRef.current = null
      if (restore) writeEngine(restore)
    }
  }, [isOpen])

  const save = () => {
    savedRef.current = readEngine()
    onSave(savedRef.current)
    onClose()
  }

  return (
    <AnimatedBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Metronome settings for this item"
      elevated
      elevatedLight
      zClass={ROUTINE_METRONOME_SHEET_Z}
      maxHeightClass="max-h-[88vh]"
    >
      <div className="routine-metronome-sheet">
        <header className="routine-metronome-sheet__header">
          <button type="button" onClick={onClose}>Cancel</button>
          <h2>Click for this item</h2>
          <button type="button" className="routine-metronome-sheet__save" onClick={save}>Save</button>
        </header>
        <p className="routine-metronome-sheet__hint">
          Play it while you set it. Save stores the tempo, time, subdivision, accents and sound on
          this item; your workspace metronome keeps its own settings.
        </p>
        <div className="routine-metronome-sheet__stage">
          <AudioPracticeMetronomeView />
        </div>
      </div>
    </AnimatedBottomSheet>
  )
}
