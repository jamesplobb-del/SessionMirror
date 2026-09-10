import { loadTimelines } from '../practiceTimeline/storage/timelineStorage'

export default function RoutineProgramSetup({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const programs = loadTimelines().filter(program => program.sections.length > 0)
  const selected = programs.find(program => program.id === value)
  const selectedLabel = !value
    ? 'No program'
    : selected?.name ?? 'Program unavailable · choose another'

  return <label className="routine-program-setup">
    <span className="practice-menu-eyebrow">Link a metronome program</span>
    <span className="routine-kind routine-program-setup__pill">
      <span className="routine-program-setup__value">{selectedLabel}</span>
      <select
        value={value ?? ''}
        aria-label="Link a metronome program"
        onChange={event => onChange(event.target.value || null)}
      >
        <option value="">No program</option>
        {value && !selected && <option value={value}>Program unavailable · choose another</option>}
        {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
      </select>
    </span>
    <small className="routine-tool__hint">{programs.length
      ? 'A saved sequence of tempo changes. It is included when you share this routine. It loads paused — press Play on the routine bar to start it, and it never starts or stops a recording on its own.'
      : 'A program is a saved sequence of tempo changes. Build one in Metronome → Program, then attach it here.'}</small>
  </label>
}
