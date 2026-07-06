import { MULTITRACK_LAYOUT_PRESETS } from '../layout/layoutPresets'
import Pressable from '../../components/ui/Pressable'

export default function MultitrackLayoutPicker({ activeLayoutId, onSelectLayout }: { activeLayoutId: string; onSelectLayout: (id: string) => void }) {
  return (
    <div className="multitrack-layout-picker">
      <div className="multitrack-layout-picker__grid">
        {MULTITRACK_LAYOUT_PRESETS.map((p) => (
          <Pressable key={p.id} type="button" intensity="soft" onClick={() => onSelectLayout(p.id)} className={`multitrack-layout-picker__item ${activeLayoutId === p.id ? 'multitrack-layout-picker__item--active' : ''}`}>
            <span className="multitrack-layout-picker__label">{p.label}</span>
            <span className="multitrack-layout-picker__count">{p.panelCount}</span>
          </Pressable>
        ))}
      </div>
    </div>
  )
}
