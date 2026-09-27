import type { Project } from '../db'

const STORAGE_KEY = 'besttake:last-active-project:v1'

export function chooseInitialProjectId(projects: Project[]): string | null {
  let savedId: string | null = null
  try { savedId = localStorage.getItem(STORAGE_KEY) }
  catch { /* The vault still opens its newest folder if preferences are unavailable. */ }
  return projects.find(project => project.id === savedId)?.id ?? projects[0]?.id ?? null
}

export function rememberActiveProjectId(projectId: string): void {
  try { localStorage.setItem(STORAGE_KEY, projectId) }
  catch { /* Folder selection remains available this session. */ }
}
