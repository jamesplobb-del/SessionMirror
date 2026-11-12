import { Check, Eraser, Pen, Redo2, Undo2 } from 'lucide-react'
import { INK_CSS, type InkColour, type InkTool } from './chartInk'
import './markup-toolbar.css'

interface MarkupToolbarProps {
  marker: InkTool
  penColour: InkColour
  canUndo: boolean
  canRedo: boolean
  menuOpen: boolean
  menuId: string
  onPen: (anchor: HTMLButtonElement) => void
  onErase: () => void
  onUndo: () => void
  onRedo: () => void
  onDone: () => void
}

/** Quick edits stay within reach while the larger options palette is tucked away. */
export default function MarkupToolbar({
  marker, penColour, canUndo, canRedo, menuOpen, menuId,
  onPen, onErase, onUndo, onRedo, onDone,
}: MarkupToolbarProps) {
  const penLabel = `${penColour === 'red' ? 'Red' : 'Black'} pen`
  return <div className="markup-toolbar" role="toolbar" aria-label="Markup tools">
    <button type="button" className="markup-toolbar__button markup-toolbar__tool"
      aria-label={penLabel} title={penLabel} aria-pressed={marker === penColour}
      data-music-menu-trigger="markup" aria-haspopup="dialog" aria-expanded={menuOpen}
      aria-controls={`${menuId}-markup`} onClick={event => onPen(event.currentTarget)}>
      <span className="markup-toolbar__pen" aria-hidden>
        <Pen style={{ color: INK_CSS[penColour] }} />
        <i style={{ backgroundColor: INK_CSS[penColour] }} />
      </span>
      <span className="markup-toolbar__tool-label">{penLabel}</span>
    </button>
    <button type="button" className="markup-toolbar__button markup-toolbar__tool"
      aria-label="Eraser" title="Eraser" aria-pressed={marker === 'eraser'} onClick={onErase}>
      <Eraser aria-hidden /><span className="markup-toolbar__tool-label">Eraser</span>
    </button>
    <button type="button" className="markup-toolbar__button" aria-label="Undo" title="Undo"
      disabled={!canUndo} onClick={onUndo}><Undo2 aria-hidden /></button>
    <button type="button" className="markup-toolbar__button" aria-label="Redo" title="Redo"
      disabled={!canRedo} onClick={onRedo}><Redo2 aria-hidden /></button>
    <button type="button" className="markup-toolbar__button markup-toolbar__done"
      aria-label="Done marking" title="Done marking" onClick={onDone}>
      <Check aria-hidden /><span className="markup-toolbar__done-label">Done</span>
    </button>
  </div>
}
