import { useEffect, useLayoutEffect, useState } from 'react'
import { useMetronome } from '../../../src/hooks/useMetronome'
import { cycleAccentLevel, ticksPerPulse } from '../../../src/metronome/metronomeTiming'
import { getPracticeRhythmOptions } from '../../../src/components/audioPractice/audioPracticeMetronome'
import type { MetronomeAccentLevel } from '../../../src/utils/metronomeConfig'
import './metronome-subdivision-concept.css'

type Anchor = { left: number; top: number; width: number; height: number }

function defaultSubdivisionAccents(pulses: number, steps: number): MetronomeAccentLevel[] {
  return Array.from({ length: pulses * Math.max(0, steps - 1) }, () => 'weak')
}

/** Fixture-only proposal: no changes to the app's audio or saved metronome settings. */
export default function MetronomeSubdivisionConcept() {
  const {
    meter, bpm, pulseModeId, pulseName, pulseCount, subdivision, beatIndex, subTickIndex,
    playing, accentLevels, setSubdivision, toggleBeatAccent,
  } = useMetronome()
  const steps = ticksPerPulse(meter, subdivision, pulseCount)
  const rhythmOptions = getPracticeRhythmOptions(meter, pulseModeId)
  const [subAccents, setSubAccents] = useState<MetronomeAccentLevel[]>(() => defaultSubdivisionAccents(pulseCount, steps))
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedPulse, setSelectedPulse] = useState(0)

  useEffect(() => {
    setSubAccents(defaultSubdivisionAccents(pulseCount, steps))
    setSelectedPulse(0)
  }, [meter, pulseCount, subdivision, steps])

  useLayoutEffect(() => {
    const stage = document.querySelector('.lens-stage')
    const rhythm = stage?.querySelector('.audio-practice-metronome__select-row--primary .metronome-audio-select:nth-child(2) .metronome-audio-select__control')
    if (!stage || !rhythm) return
    const measure = () => {
      const parent = stage.getBoundingClientRect()
      const rect = rhythm.getBoundingClientRect()
      setAnchor({ left: rect.left - parent.left, top: rect.top - parent.top, width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(rhythm)
    window.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [])

  useEffect(() => {
    if (!menuOpen && !editorOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); setEditorOpen(false) }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [menuOpen, editorOpen])

  const changeSubdivisionAccent = (index: number) => {
    setSubAccents(current => current.map((level, item) => item === index ? cycleAccentLevel(level) : level))
  }
  const openEditor = () => { setMenuOpen(false); setEditorOpen(true) }
  const activePulse = Math.min(selectedPulse, pulseCount - 1)
  const noteName = steps === 3 && pulseName.toLowerCase().includes('dotted quarter') ? 'eighth notes' : 'clicks'
  const menuTop = anchor ? Math.max(8, anchor.top - 240) : 0
  const menuLeft = anchor ? Math.max(10, Math.min(anchor.left - 80, window.innerWidth - 310)) : 0

  return <>
    {anchor && <button type="button" className="metronome-subdivision-concept__rhythm-hit"
      style={{ left:anchor.left, top:anchor.top, width:anchor.width, height:anchor.height }}
      aria-label="Rhythm subdivision and click accents" aria-expanded={menuOpen}
      onClick={() => setMenuOpen(value => !value)} />}

    {menuOpen && anchor && <>
      <button type="button" className="metronome-subdivision-concept__menu-dismiss" aria-label="Close rhythm menu" onClick={() => setMenuOpen(false)} />
      <div className="metronome-subdivision-concept__menu" role="menu" aria-label="Rhythm"
        style={{ left:menuLeft, top:menuTop }}>
        <span className="metronome-subdivision-concept__menu-heading">RHYTHM</span>
        <div className="metronome-subdivision-concept__rhythm-options">
          {rhythmOptions.map(option => <button key={option.value} type="button" role="menuitemradio" aria-checked={subdivision === option.value}
            onClick={() => { setSubdivision(option.value); setMenuOpen(false) }}>
            <span>{option.name}</span><small>{subdivision === option.value ? '✓' : ''}</small>
          </button>)}
        </div>
        {steps > 1 && <button type="button" role="menuitem" className="metronome-subdivision-concept__open-editor" onClick={openEditor}>
          Edit click accents <span aria-hidden="true">›</span>
        </button>}
      </div>
    </>}

    {editorOpen && <div className="metronome-subdivision-concept__modal" role="presentation">
      <button type="button" className="metronome-subdivision-concept__scrim" aria-label="Close click accents" onClick={() => setEditorOpen(false)} />
      <section className="metronome-subdivision-concept__sheet" role="dialog" aria-modal="true" aria-labelledby="subdivision-concept-title">
        <div className="metronome-subdivision-concept__handle" aria-hidden="true" />
        <header><div><small>RHYTHM</small><h2 id="subdivision-concept-title">Click accents</h2></div>
          <button type="button" onClick={() => setEditorOpen(false)}>Done</button></header>
        <p className="metronome-subdivision-concept__context">{meter} · {pulseName.toLowerCase()} = {bpm} BPM · {steps} {noteName} per beat</p>
        <div className="metronome-subdivision-concept__pulse-nav">
          {pulseCount > 1 && <button type="button" aria-label="Previous beat" disabled={activePulse === 0} onClick={() => setSelectedPulse(value => value - 1)}>‹</button>}
          <span>{pulseCount === 1 ? 'ONE CONDUCTING BEAT' : `BEAT ${activePulse + 1} OF ${pulseCount}`}</span>
          {pulseCount > 1 && <button type="button" aria-label="Next beat" disabled={activePulse === pulseCount - 1} onClick={() => setSelectedPulse(value => value + 1)}>›</button>}
        </div>
        <div className={`metronome-subdivision-concept__clicks${steps > 6 ? ' metronome-subdivision-concept__clicks--dense' : ''}`} role="group" aria-label={`Beat ${activePulse + 1} click accents`}>
          <button type="button" className={`metronome-subdivision-concept__click metronome-subdivision-concept__click--beat metronome-subdivision-concept__click--${accentLevels[activePulse] ?? 'weak'}${playing && beatIndex === activePulse && subTickIndex === 0 ? ' metronome-subdivision-concept__click--active' : ''}`}
            aria-label={`Main beat, ${accentLevels[activePulse] ?? 'weak'}. Tap to change accent.`}
            onClick={() => toggleBeatAccent(activePulse)}><span>{activePulse + 1}</span></button>
          {Array.from({ length:steps - 1 }, (_, sub) => {
            const index = activePulse * (steps - 1) + sub
            const level = subAccents[index] ?? 'weak'
            return <button key={sub} type="button" className={`metronome-subdivision-concept__click metronome-subdivision-concept__click--${level}${playing && beatIndex === activePulse && subTickIndex === sub + 1 ? ' metronome-subdivision-concept__click--active' : ''}`}
              aria-label={`Subdivision ${sub + 2}, ${level}. Tap to change accent.`}
              onClick={() => changeSubdivisionAccent(index)}><span aria-hidden="true" /></button>
          })}
        </div>
        <p className="metronome-subdivision-concept__hint">Tap a click to cycle: weak → medium → strong → silent.</p>
      </section>
    </div>}
  </>
}
