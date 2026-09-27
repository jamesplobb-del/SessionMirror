import PremiumSelect from './ui/PremiumPicker'
import { loadTimelines } from '../practiceTimeline/storage/timelineStorage'

export default function RoutineProgramSetup({ value, onChange, scope = 'routine' }: { value: string | null; onChange: (id: string | null) => void; scope?: 'routine' | 'score' }) {
  const programs = loadTimelines().filter(program => program.sections.length > 0)
  const selected = programs.find(program => program.id === value)
  return <div className="routine-program-setup">
    <span className="practice-menu-eyebrow">Link a metronome program</span>
    <PremiumSelect title="Link a metronome program" value={value ?? ''} searchable={programs.length > 8}
      options={[
        { value: '', label: 'No program' },
        ...(value && !selected ? [{ value, label: 'Program unavailable · choose another', disabled: true }] : []),
        ...programs.map(program => ({ value: program.id, label: program.name })),
      ]}
      onChange={id => onChange(id || null)} />
    <small className="routine-tool__hint">{programs.length
      ? scope === 'score'
        ? 'A saved sequence of tempo changes. It loads paused when you open this score; press Play on the metronome to start it.'
        : 'A saved sequence of tempo changes. It is included when you share this routine. It loads paused — press Play on the routine bar to start it, and it never starts or stops a recording on its own.'
      : 'A program is a saved sequence of tempo changes. Build one in Metronome → Program, then attach it here.'}</small>
  </div>
}
