import { LayoutGlyph } from './MultitrackToolbar'
import type { MultitrackSession, PerformancePanelState } from '../types'
import type { MultitrackProjectSummary } from '../state/multitrackPersistence'
import { compositionRects } from '../layout/composition'
import { MULTITRACK_LAYOUT_PRESETS, getLayoutPreset } from '../layout/layoutPresets'

export default function MultitrackProjectPanel({ session, projects, onProject, onUpdate, onPanel, onLayout, onReorder, onUndo, canUndo, onRecord, time }: {
  session: MultitrackSession; projects: MultitrackProjectSummary[]
  onProject: (id?: string, duplicate?: boolean) => void
  onUpdate: (patch: Partial<MultitrackSession>) => void
  onPanel: (id: string, patch: Partial<PerformancePanelState>) => void
  onLayout: (id: string) => void
  onReorder: (id: string, beforeId: string) => void
  onUndo: () => void; canUndo: boolean
  onRecord: (id: string, time: number) => void; time: number
}) {
  const rects = compositionRects(session, getLayoutPreset(session.layoutId), time).panelRects
  const boxName = (panel: PerformancePanelState) => panel.label || panel.take?.name || `${panel.overlay ? 'Extra' : 'Box'} ${session.panels.filter(p => p.kind === 'performance' && !!p.overlay === !!panel.overlay).findIndex(p => p.id === panel.id) + 1}`
  return <div className="multitrack-project-panel">
    <details className="multitrack-project-files"><summary>Project · {session.name || 'My performance'}</summary>
    <label>Performance name<input aria-label="Performance name" value={session.name ?? ''} maxLength={80} onChange={e => onUpdate({ name: e.target.value })} /></label>
    <div className="multitrack-studio-actions">
      <button onClick={() => onProject()}>New project</button>
      <button onClick={() => onProject(undefined, true)}>Duplicate</button>
      <button disabled={!canUndo} onClick={onUndo}>Undo</button>
    </div>
    <label>Open saved project<select value={session.projectId ?? ''} onChange={e => onProject(e.target.value)}>
      {!projects.some(p => p.id === session.projectId) && <option value={session.projectId}>Current performance</option>}
      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    </details>
    <div className="multitrack-settings-heading"><h2>Choose your layout</h2>
      <p>Choose how many boxes fill the main picture. Extra boxes sit on top and do not use these spaces.</p></div>
    <div className="multitrack-layout-options" role="group" aria-label="Base layout">
      {MULTITRACK_LAYOUT_PRESETS.map(p => <button key={p.id} className="multitrack-layout-card" aria-label={`${p.label} layout`} aria-pressed={session.layoutId === p.id} onClick={() => onLayout(p.id)}>
        <span className="multitrack-layout-card__preview" style={{ aspectRatio: (session.aspectRatio || '9:16').replace(':', '/'), height: session.aspectRatio === '16:9' ? 36 : 64 }}><LayoutGlyph {...p} /></span>
        <span>{p.label}</span><span className="multitrack-layout-card__check" aria-hidden>{session.layoutId === p.id ? '✓' : ''}</span>
      </button>)}
    </div>
    <div className="multitrack-settings-heading"><h2>Edit individual boxes</h2><p>These are your recording spaces, not layout choices. Open a box to name it, change its size or choose when it appears. The highlighted space shows its position.</p></div>
    {session.panels.map((p, i) => p.kind !== 'performance' ? null : <details key={p.id} className="multitrack-part-settings"
      draggable onDragStart={e => e.dataTransfer.setData('text/plain', p.id)} onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); onReorder(e.dataTransfer.getData('text/plain'), p.id) }}>
      <summary>
        <span className="multitrack-part-map" aria-hidden style={{ aspectRatio: (session.aspectRatio || '9:16').replace(':', '/') }}>
          {Object.entries(rects).map(([id, r]) => <span key={id} className={id === p.id ? 'is-highlighted' : ''} style={{ left: `${r.xPercent}%`, top: `${r.yPercent}%`, width: `${r.widthPercent}%`, height: `${r.heightPercent}%`, zIndex: session.panels.find(other => other.id === id)?.kind === 'performance' && (session.panels.find(other => other.id === id) as PerformancePanelState)?.overlay ? 2 : 1 }} />)}
        </span>
        <span className="multitrack-part-heading"><strong>{boxName(p)}</strong><small>{p.overlay ? 'Extra box · above layout' : 'Main layout'}{p.hidden ? ' · Hidden' : !rects[p.id] ? ' · Not visible at this time' : ''}</small></span>
        <span className="multitrack-part-chevron" aria-hidden>⌄</span>
      </summary>
      <label>Box name<input aria-label={`${boxName(p)} name`} placeholder={boxName(p)} value={p.label ?? ''} maxLength={60} onChange={e => onPanel(p.id, { label: e.target.value })} /></label>
      <div className="multitrack-studio-actions">
        <button aria-pressed={!!p.hidden} onClick={() => onPanel(p.id, { hidden: !p.hidden })}>{p.hidden ? 'Show part' : 'Hide part'}</button>
        <button aria-pressed={!!p.overlay} disabled={!!p.overlay && session.panels.filter(p => p.kind === 'performance' && !p.overlay).length >= 12} onClick={() => onPanel(p.id, { overlay: p.overlay ? undefined : { xPercent: 64, yPercent: 64, widthPercent: 32, heightPercent: 28 } })}>{p.overlay ? 'Move into main layout' : 'Make an extra box'}</button>
        <button disabled={i === 0} onClick={() => onReorder(p.id, session.panels[i - 1].id)}>Move earlier</button>
        {!p.take && <button onClick={() => onRecord(p.id, time)}>Record here</button>}
      </div>
      {p.overlay && <>
        <div className="multitrack-studio-actions">{['Top left', 'Top right', 'Bottom left', 'Bottom right'].map((label, n) => <button key={label} onClick={() => onPanel(p.id, { overlay: { ...p.overlay!, xPercent: n % 2 ? 98 - p.overlay!.widthPercent : 2, yPercent: n >= 2 ? 98 - p.overlay!.heightPercent : 2 } })}>{label}</button>)}</div>

      </>}
      <div className="multitrack-time-fields">
        {(['widthPercent', 'heightPercent'] as const).map(dimension => {
          const rect = p.overlay ?? p.frame ?? rects[p.id] ?? { xPercent: 0, yPercent: 0, widthPercent: 50, heightPercent: 50 }
          const isWidth = dimension === 'widthPercent'
          return <label key={dimension}>{isWidth ? 'Width' : 'Height'} · {Math.round(rect[dimension])}%<input type="range" min={10} max={100} value={rect[dimension]} aria-label={`Part ${i + 1} ${isWidth ? 'width' : 'height'}`} onChange={e => {
            const size = Number(e.target.value)
            const next = { ...rect, [dimension]: size, [isWidth ? 'xPercent' : 'yPercent']: Math.min(rect[isWidth ? 'xPercent' : 'yPercent'], 100 - size) }
            onPanel(p.id, p.overlay ? { overlay: next } : { frame: next })
          }} /></label>
        })}
      </div>
      {!p.overlay && p.frame && <button onClick={() => onPanel(p.id, { frame: undefined })}>Reset size & position</button>}
      <div className="multitrack-time-fields">
        <label>Appears at (seconds)<input type="number" min={0} step={.1} placeholder="Start" value={p.sectionStartSec ?? ''} onChange={e => onPanel(p.id, { sectionStartSec: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} /></label>
        <label>Disappears at (seconds)<input type="number" min={(p.sectionStartSec ?? 0) + .1} step={.1} placeholder="End" value={p.sectionEndSec ?? ''} onChange={e => onPanel(p.id, { sectionEndSec: e.target.value === '' ? undefined : Math.max((p.sectionStartSec ?? 0) + .1, Number(e.target.value)) })} /></label>
      </div>
      <label className="multitrack-check"><input type="checkbox" checked={p.sectionAudio === true} onChange={e => onPanel(p.id, { sectionAudio: e.target.checked })} /> Play audio only while this box is visible</label>
      <button onClick={() => onPanel(p.id, { sectionStartSec: undefined, sectionEndSec: undefined })}>Show for whole song</button>
      {p.overlay && <button onClick={() => onUpdate({ panels: session.panels.filter(other => other.id !== p.id) })}>Delete extra box</button>}
    </details>)}
  </div>
}
