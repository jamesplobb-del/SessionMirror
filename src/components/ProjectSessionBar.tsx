import { useEffect, useRef, useState } from 'react'
import { FolderPlus, Trash2 } from 'lucide-react'
import { useActionSheet } from '../context/ActionSheetContext'
import type { Project } from '../db/types'
import AnimatedExpand from './ui/AnimatedExpand'
import Pressable from './ui/Pressable'

interface ProjectSessionBarProps {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (projectId: string) => void
  onCreateProject: (name: string) => void | Promise<void>
  onDeleteProject?: (projectId: string) => void | Promise<void>
}

export default function ProjectSessionBar({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
}: ProjectSessionBarProps) {
  const { showConfirm } = useActionSheet()
  const [isNamingSession, setIsNamingSession] = useState(false)
  const [sessionNameDraft, setSessionNameDraft] = useState('New Session')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isNamingSession) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isNamingSession])

  const openNamingForm = () => {
    setSessionNameDraft('New Session')
    setIsNamingSession(true)
  }

  const cancelNaming = () => {
    setIsNamingSession(false)
  }

  const submitNaming = () => {
    const trimmed = sessionNameDraft.trim()
    if (!trimmed) return
    setIsNamingSession(false)
    void onCreateProject(trimmed)
  }

  const handleDeleteSession = (project: Project) => {
    if (!onDeleteProject) return
    void (async () => {
      const confirmed = await showConfirm({
        message: `Delete session "${project.name}" and all takes inside it? This cannot be undone.`,
        destructive: true,
        confirmLabel: 'Delete',
      })
      if (!confirmed) return
      void onDeleteProject(project.id)
    })()
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sessions</p>

      <AnimatedExpand open={isNamingSession}>
        <form
          className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3"
          onSubmit={(event) => {
            event.preventDefault()
            submitNaming()
          }}
        >
          <label className="text-xs font-medium text-stone-600" htmlFor="new-session-name">
            Session name
          </label>
          <input
            ref={inputRef}
            id="new-session-name"
            type="text"
            value={sessionNameDraft}
            onChange={(event) => setSessionNameDraft(event.target.value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-sky-400 focus:ring-2"
            maxLength={48}
          />
          <div className="flex justify-end gap-2">
            <Pressable
              type="button"
              intensity="soft"
              onClick={cancelNaming}
              haptic="light"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
            >
              Cancel
            </Pressable>
            <Pressable
              type="submit"
              intensity="soft"
              haptic="medium"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
            >
              Create
            </Pressable>
          </div>
        </form>
      </AnimatedExpand>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Pressable
          type="button"
          intensity="soft"
          onClick={openNamingForm}
          haptic="light"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:border-stone-400 hover:bg-stone-50"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New Session
        </Pressable>
        {projects.map((project) => {
          const active = project.id === activeProjectId
          return (
            <div
              key={project.id}
              className={`flex shrink-0 items-center rounded-full border ${
                active
                  ? 'border-sky-300 bg-sky-50'
                  : 'border-stone-200 bg-stone-50'
              }`}
            >
              <Pressable
                type="button"
                intensity="soft"
                onClick={() => onSelectProject(project.id)}
                haptic="light"
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  active ? 'text-sky-800' : 'text-stone-600 hover:text-stone-800'
                }`}
              >
                {project.name}
              </Pressable>
              {onDeleteProject && (
                <Pressable
                  type="button"
                  intensity="icon"
                  onClick={() => handleDeleteSession(project)}
                  haptic="light"
                  className="rounded-full px-2 py-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-600"
                  aria-label={`Delete session ${project.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Pressable>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
