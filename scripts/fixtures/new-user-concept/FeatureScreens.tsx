import { useEffect, useRef, useState } from 'react'
import { LiveAudioTunerPane } from '../../../src/components/LivePitchTuner'
import AudioPracticeMetronomeView from '../../../src/components/audioPractice/AudioPracticeMetronomeView'
import LabsMenu from '../../../src/components/labs/LabsMenu'
import MusicWidget from '../../../src/components/practiceChart/MusicWidget'
import { sharedMetronomeEngine } from '../../../src/metronome/sharedMetronomeEngine'
import { drawSilkTuner } from '../../../src/utils/reactiveSilkTuner'
import { appendTunerTrace, createTunerTrace, tunerTracePoints } from '../../../src/utils/tunerTrace'
import { appendTunerHistory, type TunerHistorySample } from '../../../src/utils/tunerHistory'
import type { TunerTranspositionId } from '../../../src/utils/tunerTransposition'
import type { TunerInstrument } from '../../../src/utils/pitchConfig'
import '../../../src/components/practice-chart.css'

const noop = () => {}

type Props = {
  screen: 'tuner' | 'metronome' | 'games' | 'music'
  onBack: () => void
  onNotice: (message: string) => void
}

function TunerConcept() {
  const canvas = useRef<HTMLCanvasElement | null>(null)
  const trace = useRef(createTunerTrace())
  const history = useRef<TunerHistorySample[]>([])
  const [readout, setReadout] = useState({ noteName: 'A4', midi: 69, frequencyHz: 440, cents: 2 })
  const [notes, setNotes] = useState<number[]>([])
  const [octave, setOctave] = useState(4)
  const [capture, setCapture] = useState(true)
  const [transposition, setTransposition] = useState<TunerTranspositionId>('concert')
  const [instrument, setInstrument] = useState<TunerInstrument>('winds')

  useEffect(() => {
    const wash = document.querySelector<HTMLElement>('.premium-tuner-wash')
    const paint = () => {
      const c = canvas.current
      if (!c || document.hidden) return
      const now = performance.now()
      const cents = 2 + 6 * Math.sin(now / 2100) + 2 * Math.sin(now / 560)
      const next = { noteName: 'A4', midi: 69, frequencyHz: 440 * 2 ** (cents / 1200), cents }
      appendTunerTrace(trace.current, now, cents)
      appendTunerHistory(history.current, now, next)
      setReadout(next)
      const w = c.clientWidth, h = c.clientHeight
      if (!w || !h) return
      const dpr = Math.min(devicePixelRatio, 2)
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
      }
      const ctx = c.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const dark = document.documentElement.classList.contains('app-dark-mode')
      const color = drawSilkTuner(ctx, w, h, tunerTracePoints(trace.current.samples, now, w, h), true, dark, true)
      const overlay = c.closest<HTMLElement>('.app-ui-overlay--audio-practice-tuner')
      overlay?.style.setProperty('--silk-wash', color)
      overlay?.style.setProperty('--silk-live', color)
      // The preview has separate safe areas and a dock, unlike App.tsx's
      // full-viewport overlay. Paint its full-screen backing with the same
      // renderer color; keep this animated property non-inheriting.
      wash?.style.setProperty('--silk-wash', color)
    }
    const timer = window.setInterval(paint, 80)
    paint()
    return () => window.clearInterval(timer)
  }, [])

  return <div className="pitch-tuner pitch-tuner--audio flex h-full min-h-0 flex-col">
    <LiveAudioTunerPane
      readout={readout} canvasRef={canvas}
      tunerInstrument={instrument} tunerTransposition={transposition}
      onTunerTranspositionChange={setTransposition} onTunerInstrumentChange={setInstrument}
      hapticsEnabled={false} insightsEnabled pitchHistory={history} visualTrace={trace}
      insightsCaptureEnabled={capture} onInsightsCaptureChange={setCapture}
      drone={{
        activeNotes: notes, octave,
        onToggleNote: note => setNotes(current => current.includes(note) ? current.filter(item => item !== note) : [...current, note]),
        onGlissNote: (note, nextOctave) => { setNotes([note]); setOctave(nextOctave) },
        onSetNotes: setNotes,
        onIncrementOctave: () => setOctave(value => Math.min(7, value + 1)),
        onDecrementOctave: () => setOctave(value => Math.max(1, value - 1)),
        hapticsEnabled: false,
      }}
    />
  </div>
}

function MetronomeConcept({ onNotice }: Pick<Props, 'onNotice'>) {
  useEffect(() => () => sharedMetronomeEngine.stop(), [])
  return <AudioPracticeMetronomeView onOpenProgram={() => onNotice('Build a tempo program · concept preview')} />
}

function MusicConcept({ onBack, onNotice }: Pick<Props, 'onBack' | 'onNotice'>) {
  const boundary = useRef<HTMLDivElement | null>(null)
  return <div ref={boundary} className="new-user-music-surface" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 360 }}>
    <MusicWidget
      boundaryRef={boundary} visible hasChart={false} fileName={null} pageView={null}
      paperVisible={false} busy={false} error="" fit="page" spreadAvailable={false} halfTurn={false}
      onAdd={() => onNotice('Add sheet music from a PDF or photo · concept preview')}
      onRemove={onBack} onTurn={noop} onFitChange={noop} onHalfTurnChange={noop} onPaperVisibleChange={noop}
      chromeHidden={false} onChromeHiddenChange={noop} marker={null} inkWidth="medium" markCount={0}
      saving={false} onMarkerChange={noop} onInkWidthChange={noop} onUndoMark={noop} onClearMarks={noop} onSaveMarked={noop}
    />
  </div>
}

export default function FeatureScreens({ screen, onBack, onNotice }: Props) {
  if (screen === 'tuner') return <TunerConcept />
  if (screen === 'metronome') return <MetronomeConcept onNotice={onNotice} />
  if (screen === 'music') return <MusicConcept onBack={onBack} onNotice={onNotice} />
  return <LabsMenu
    hapticFeedback={false} tunerInstrument="winds" tunerTransposition="concert" onBack={onBack}
    onOpenStaffJumper={() => onNotice('Staff Jumper: learn notes as you play · concept preview')}
    onOpenBalance={() => onNotice('Balance: steady your pitch · concept preview')}
    onOpenLearnInstrument={() => onNotice('Learn your instrument · concept preview')}
  />
}
