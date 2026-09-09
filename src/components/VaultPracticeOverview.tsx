import { useState } from 'react'
import { ChevronRight, Music2, ListMusic, FolderOpen } from 'lucide-react'
import { loadRoutineLibrary } from '../utils/routineLibrary'
import type { Project } from '../db/types'
export default function VaultPracticeOverview({projects,onOpenProject}:{projects:Project[];onOpenProject:(id:string)=>void}) {
  const [routines] = useState(loadRoutineLibrary)
  return <section className="vault-practice-overview" aria-label="Practice library">
    <header><h3>Your practice, together.</h3><p>Find recordings by the routine or exercise you worked on.</p></header>
    <h4><ListMusic size={18}/>Saved routines</h4>
    {routines.length ? routines.map(routine => <details className="vault-routine-group" key={routine.id}>
      <summary><span><strong>{routine.name}</strong><small>{routine.steps.length} exercises</small></span><ChevronRight size={18}/></summary>
      <div>{routine.steps.map(step => {const linked=projects.find(project=>project.id===step.projectId);return <div key={step.id} className="vault-exercise-link"><Music2 size={18}/><span><strong>{step.title}</strong><small>{linked?'View recorded takes':'No linked recordings yet'}</small></span>{linked && <button onClick={()=>onOpenProject(linked.id)} aria-label={`Open takes for ${step.title}`}>Open<ChevronRight size={14}/></button>}</div>})}</div>
    </details>) : <div className="vault-practice-empty">Saved routines will appear here. Build and save one from Home.</div>}
    <h4><FolderOpen size={18}/>Practice folders</h4>
    <div className="vault-practice-folders">{projects.map(project=><button key={project.id} onClick={()=>onOpenProject(project.id)}><Music2 size={18}/><span>{project.name}</span><ChevronRight size={16}/></button>)}</div>
  </section>
}
