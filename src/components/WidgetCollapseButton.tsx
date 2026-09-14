import { ChevronsUp } from 'lucide-react'

export default function WidgetCollapseButton({ label, onCollapse }: {
  label: string
  onCollapse: () => void
}) {
  return <button type="button" data-no-drag className="widget-collapse"
    aria-label={`Collapse ${label}`} aria-expanded
    onPointerDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); onCollapse() }}>
    <ChevronsUp aria-hidden />
  </button>
}
