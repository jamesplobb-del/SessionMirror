import { loadTimelines } from '../practiceTimeline/storage/timelineStorage'

export default function RoutineProgramSetup({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const programs = loadTimelines().filter(program => program.sections.length > 0)
  return <label className="practice-menu-field routine-program-setup">
    <span>Metronome program · optional</span>
    <select value={value ?? ''} onChange={event => onChange(event.target.value || null)}>
      <option value="">No program</option>
      {value && !programs.some(program => program.id === value) && <option value={value}>Program unavailable · choose another</option>}
      {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
    </select>
    <small>{programs.length
      ? 'A saved sequence of tempo changes. It loads paused — press Play on the routine bar to start it, and it never starts or stops a recording on its own.'
      : 'A program is a saved sequence of tempo changes. Build one in Metronome → Program, then attach it here.'}</small>
  </label>
}
