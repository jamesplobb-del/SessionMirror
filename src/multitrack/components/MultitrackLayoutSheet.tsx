import { useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import type { MultitrackSession, PerformancePanelState } from '../types'
import { MULTITRACK_LAYOUT_PRESETS, getLayoutPreset } from '../layout/layoutPresets'
import { compositionRects } from '../layout/composition'
import { normalizeLayoutStyle, withExtraBox, withPortraitLayout } from '../layout/quietWorkspaceLayout'
import { sheetLayoutAsset } from '../sheetMusic/sheetMusicTimeline'
import { LayoutGlyph } from './MultitrackToolbar'

export default function MultitrackLayoutSheet({ session, onApply, onCancel }: {
  session: MultitrackSession; onApply: (draft: MultitrackSession) => void; onCancel: () => void
}) {
  const [draft, setDraft] = useState(() => withPortraitLayout(session, session.layoutId))
  const [swap, setSwap] = useState<string | null>(null)
  const [selectedExtra, setSelectedExtra] = useState<string | null>(null)
  const style = normalizeLayoutStyle(draft.layoutStyle)
  const extras = draft.panels.filter((p): p is PerformancePanelState => p.kind === 'performance' && !!p.overlay)
  const extra = extras.find(p => p.id === selectedExtra)
  const { panelRects: rects, musicRect } = compositionRects(draft, getLayoutPreset(draft.layoutId), 0)
  const music = sheetLayoutAsset(draft.sheetMusic)
  const updateExtra = (key: 'xPercent' | 'yPercent' | 'widthPercent' | 'heightPercent', value: number) => setDraft(prev => ({ ...prev, panels: prev.panels.map(p => {
    if (p.kind !== 'performance' || p.id !== selectedExtra || !p.overlay) return p
    const rect = { ...p.overlay, [key]: value }
    rect.xPercent = Math.min(rect.xPercent, 100 - rect.widthPercent); rect.yPercent = Math.min(rect.yPercent, 100 - rect.heightPercent)
    return { ...p, overlay: rect }
  }) }))
  return <div className="multitrack-layout-sheet">
    <header className="multitrack-quiet-sheet-heading"><div><h2>Layout</h2><p>Arrange your parts before applying.</p></div><button onClick={onCancel} aria-label="Close layout"><X size={18} /></button></header>
    <div className="multitrack-layout-sheet__scroll">
      <div className="multitrack-layout-live-preview" aria-label="Portrait layout preview">
        {musicRect && music && <div style={{ left: `${musicRect.xPercent}%`, top: `${musicRect.yPercent}%`, width: `${musicRect.widthPercent}%`, height: `${musicRect.heightPercent}%`, borderRadius: `${style.cornerRadius / 3}px` }}>{music.missing ? <span>File missing</span> : music.mimeType === 'application/pdf' ? <span>PDF</span> : <img src={music.src} alt="Sheet music" />}</div>}
        {draft.panels.map(p => { const rect = rects[p.id]; return rect && p.kind === 'performance' ? <div key={p.id} style={{ left: `${rect.xPercent}%`, top: `${rect.yPercent}%`, width: `${rect.widthPercent}%`, height: `${rect.heightPercent}%`, borderRadius: `${style.cornerRadius / 3}px`, zIndex: p.overlay ? 2 : 1 }}>
          {p.take?.thumbnailUrl ? <img src={p.take.thumbnailUrl} alt="" /> : <span>{p.overlay ? '+' : draft.panels.indexOf(p) + 1}</span>}
        </div> : null })}
      </div><p className="multitrack-layout-portrait">Portrait</p>
      <h3>Boxes</h3><div className="multitrack-quiet-layout-options" role="group" aria-label="Base layout">
        {MULTITRACK_LAYOUT_PRESETS.map(p => <button key={p.id} aria-label={p.label} aria-pressed={draft.layoutId === p.id} onClick={() => setDraft(prev => withPortraitLayout(prev, p.id))}><LayoutGlyph {...p} /><span>{p.label}</span></button>)}
      </div>
      <h3>Extra boxes</h3><p className="multitrack-layout-note">Add up to four movable boxes over the main grid.</p>
      <div className="multitrack-extra-options">{extras.map((p, i) => <button key={p.id} aria-pressed={selectedExtra === p.id} onClick={() => setSelectedExtra(p.id)}>{p.label || `Extra ${i + 1}`}</button>)}<button disabled={extras.length >= 4} onClick={() => { const id = `extra-${crypto.randomUUID()}`; setDraft(prev => withExtraBox(prev, id)); setSelectedExtra(id) }}><Plus size={16} />Extra box</button></div>
      {extra?.overlay && <div className="multitrack-extra-editor">
        {(['xPercent', 'yPercent', 'widthPercent', 'heightPercent'] as const).map((key, i) => <label key={key}>{['Horizontal position', 'Vertical position', 'Width', 'Height'][i]}<output>{Math.round(extra.overlay![key])}%</output><input type="range" aria-label={['Horizontal position', 'Vertical position', 'Width', 'Height'][i]} min={i < 2 ? 0 : 5} max={key === 'xPercent' ? 100 - extra.overlay!.widthPercent : key === 'yPercent' ? 100 - extra.overlay!.heightPercent : 100} value={extra.overlay![key]} onChange={e => updateExtra(key, Number(e.target.value))} /></label>)}
        <button className="multitrack-remove-extra" onClick={() => { setDraft(prev => ({ ...prev, panels: prev.panels.filter(p => p.id !== extra.id) })); setSelectedExtra(null) }}>Remove extra box</button>
      </div>}
      <h3>Finish</h3><div className="multitrack-extra-editor"><label>Rounded corners<output>{style.cornerRadius}</output><input type="range" aria-label="Rounded corners" min={0} max={24} value={style.cornerRadius} onChange={e => setDraft(prev => ({ ...prev, layoutStyle: { ...normalizeLayoutStyle(prev.layoutStyle), cornerRadius: Number(e.target.value) } }))} /></label></div>
      <h3>Order</h3><p className="multitrack-layout-note">Tap two parts to swap their positions.</p><div className="multitrack-extra-options">{draft.panels.filter((p): p is PerformancePanelState => p.kind === 'performance' && !p.overlay && !p.hidden).map((p, i) => <button key={p.id} aria-pressed={swap === p.id} onClick={() => { if (!swap) { setSwap(p.id); return } setDraft(prev => { const panels = [...prev.panels], a = panels.findIndex(p => p.id === swap), b = panels.findIndex(other => other.id === p.id); if (a >= 0 && b >= 0) [panels[a], panels[b]] = [panels[b], panels[a]]; return { ...prev, panels } }); setSwap(null) }}>{p.label || `Part ${i + 1}`}</button>)}</div>
    </div>
    <footer><button onClick={onCancel}>Cancel</button><button className="multitrack-quiet-primary" onClick={() => onApply(draft)}><Check size={17} />Apply layout</button></footer>
  </div>
}
