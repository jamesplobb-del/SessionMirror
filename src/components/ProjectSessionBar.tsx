import { FolderPlus } from 'lucide-react'
import type { Project } from '../db/types'

interface ProjectSessionBarProps {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (projectId: string) => void
  onCreateProject: () => void
}

export default function ProjectSessionBar({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
}: ProjectSessionBarProps) {
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sessions</p>
        <button
          type="button"
          onClick={onCreateProject}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New Session
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {projects.map((project) => {
          const active = project.id === activeProjectId
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject(project.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-sky-300 bg-sky-50 text-sky-800'
                  : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:bg-stone-100'
              }`}
            >
              {project.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
