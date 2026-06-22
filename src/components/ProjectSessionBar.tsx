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
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="pro-studio-section-header">Sessions</p>
        <Pressable
          type="button"
          intensity="soft"
          onClick={openNamingForm}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#1a1a1a] px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-amber-500/30 hover:bg-white/5"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New Session
        </Pressable>
      </div>

      <AnimatedExpand open={isNamingSession}>
        <form
          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#1a1a1a] p-4"
          onSubmit={(event) => {
            event.preventDefault()
            submitNaming()
          }}
        >
          <label className="text-xs font-medium text-gray-500" htmlFor="new-session-name">
            Session name
          </label>
          <input
            ref={inputRef}
            id="new-session-name"
            type="text"
            value={sessionNameDraft}
            onChange={(event) => setSessionNameDraft(event.target.value)}
            className="rounded-xl border border-white/10 bg-[#121212] px-3 py-2 text-sm text-gray-100 outline-none ring-amber-500/40 focus:ring-2"
            maxLength={48}
          />
          <div className="flex justify-end gap-2">
            <Pressable
              type="button"
              intensity="soft"
              onClick={cancelNaming}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-white/5"
            >
              Cancel
            </Pressable>
            <Pressable
              type="submit"
              intensity="soft"
              className="rounded-full bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-gray-100 transition hover:bg-amber-500 active:scale-[0.98]"
            >
              Create
            </Pressable>
          </div>
        </form>
      </AnimatedExpand>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {projects.map((project) => {
          const active = project.id === activeProjectId
          return (
            <Pressable
              key={project.id}
              type="button"
              intensity="soft"
              onClick={() => onSelectProject(project.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                  : 'border-white/10 bg-[#1a1a1a] text-gray-500 hover:border-white/15 hover:bg-white/5'
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
