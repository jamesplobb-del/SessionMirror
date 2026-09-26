import { ChevronRight, Copy, FolderOpen, Plus } from 'lucide-react'
import type { MultitrackSession } from '../types'
import type { MultitrackProjectSummary } from '../state/multitrackPersistence'
import ProjectFileActions from './ProjectFileActions'

type ProjectSaveStatus = 'saving' | 'saved' | 'error'

const saveLabels: Record<ProjectSaveStatus, string> = {
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Couldn’t save',
}

export default function MultitrackProjectsPanel({ session, projects, saveStatus, busy, onProject, onUpdate,
  onRetrySave, onOpenParts, onShare, onImport }: {
  session: MultitrackSession
  projects: MultitrackProjectSummary[]
  saveStatus: ProjectSaveStatus
  busy: boolean
  onProject: (id?: string, duplicate?: boolean) => void
  onUpdate: (patch: Partial<MultitrackSession>) => void
  onRetrySave: () => void
  onOpenParts: () => void
  onShare: () => void
  onImport: (file: File) => void
}) {
  const otherProjects = projects.filter(project => project.id !== session.projectId)
  return <div className="multitrack-projects-panel">
    <section className="multitrack-projects-current" aria-label="Current project">
      <div className="multitrack-projects-heading">
        <h2>Current project</h2>
        <span className={`multitrack-save-status multitrack-save-status--${saveStatus}`} role="status">{saveLabels[saveStatus]}</span>
      </div>
      <label htmlFor="multitrack-project-name">Project name</label>
      <input id="multitrack-project-name" value={session.name ?? ''} maxLength={80}
        disabled={busy} onChange={event => onUpdate({ name: event.target.value })} />
      {saveStatus === 'error' && <button type="button" className="multitrack-projects-retry" disabled={busy} onClick={onRetrySave}>Retry save</button>}
      <div className="multitrack-projects-secondary-actions">
        <button type="button" disabled={busy} onClick={() => onProject(undefined, true)}><Copy aria-hidden /> Duplicate</button>
        <button type="button" disabled={busy} onClick={onOpenParts}>Manage parts <ChevronRight aria-hidden /></button>
      </div>
    </section>

    <button type="button" className="multitrack-projects-new" disabled={busy} onClick={() => onProject()}>
      <Plus aria-hidden /><span><strong>New project</strong><small>Start a separate performance</small></span><ChevronRight aria-hidden />
    </button>

    <section className="multitrack-projects-collaborate" aria-label="Share and collaborate">
      <div className="multitrack-projects-heading"><h2>Share & collaborate</h2></div>
      <p>Send this project with its recordings. Someone else can add a part and send it back.</p>
      <ProjectFileActions busy={busy} onShare={onShare} onImport={onImport} />
      <p className="multitrack-file-note">Imported project files open as separate projects.</p>
    </section>

    <section className="multitrack-projects-library" aria-label="Saved projects">
      <div className="multitrack-projects-heading"><h2>Saved projects</h2><span>{otherProjects.length} other{otherProjects.length === 1 ? '' : 's'}</span></div>
      {otherProjects.length ? <div className="multitrack-projects-list">
        {otherProjects.map(project => <button type="button" key={project.id} disabled={busy} onClick={() => onProject(project.id)}>
          <FolderOpen aria-hidden /><span><strong>{project.name || 'Untitled performance'}</strong><small>Edited {new Date(project.updatedAt).toLocaleDateString()}</small></span><ChevronRight aria-hidden />
        </button>)}
      </div> : <p className="multitrack-projects-empty">Other projects will appear here when you create them.</p>}
    </section>

  </div>
}
