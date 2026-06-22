import { useEffect, useRef, useState } from 'react'
import { FolderPlus } from 'lucide-react'
import type { Project } from '../db/types'
import AnimatedExpand from './ui/AnimatedExpand'
import Pressable from './ui/Pressable'

interface ProjectSessionBarProps {
  projects: Project[]
  activeProjectId: string | null
  onSelectProject: (projectId: string) => void
  onCreateProject: (name: string) => void | Promise<void>
}

export default function ProjectSessionBar({
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
}: ProjectSessionBarProps) {
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

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Sessions</p>
        <Pressable
          type="button"
          intensity="soft"
          onClick={openNamingForm}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-stone-300 hover:bg-stone-50"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New Session
        </Pressable>
      </div>

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
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100"
            >
              Cancel
            </Pressable>
            <Pressable
              type="submit"
              intensity="soft"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700"
            >
              Create
            </Pressable>
          </div>
        </form>
      </AnimatedExpand>

      <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-2">
        {projects.map((project) => {
          const active = project.id === activeProjectId
          return (
            <Pressable
              key={project.id}
              type="button"
              intensity="soft"
              onClick={() => onSelectProject(project.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                active
                  ? 'border-sky-300 bg-sky-50 text-sky-800'
                  : 'border-stone-200 bg-stone-50 text-stone-600 hover:border-stone-300 hover:bg-stone-100'
              }`}
            >
              {project.name}
            </Pressable>
          )
        })}
      </div>
    </div>
  )
}
