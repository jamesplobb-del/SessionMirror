import { buildYoutubeProxyUrl, parseYoutubeVideoId } from './youtubeEmbed'

export interface PracticeReference {
  videoId: string
  title: string
  channel: string
}
export interface SavedPracticeReference extends PracticeReference {
  savedAt: number
  projectIds: string[]
}
interface ReferenceLibrary {
  items: SavedPracticeReference[]
  selected: Record<string, string>
}
const KEY = 'besttake:practice-references:v1'

export function loadReferenceLibrary(): ReferenceLibrary {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      items: Array.isArray(raw.items) ? raw.items.filter((item: SavedPracticeReference) =>
        item && /^[\w-]{11}$/.test(item.videoId) && typeof item.title === 'string' &&
        typeof item.channel === 'string' && Number.isFinite(item.savedAt) &&
        Array.isArray(item.projectIds) && item.projectIds.every(id => typeof id === 'string'),
      ) : [],
      selected: raw.selected && typeof raw.selected === 'object' && !Array.isArray(raw.selected)
        ? raw.selected : {},
    }
  } catch { return { items: [], selected: {} } }
}

export function savePracticeReference(reference: PracticeReference, projectId?: string): void {
  if (!/^[\w-]{11}$/.test(reference.videoId)) throw new Error('This YouTube link is invalid.')
  const library = loadReferenceLibrary()
  const existing = library.items.find(item => item.videoId === reference.videoId)
  const projectIds = [...new Set([...(existing?.projectIds ?? []), ...(projectId ? [projectId] : [])])]
  library.items = [{ ...reference, savedAt: existing?.savedAt ?? Date.now(), projectIds },
    ...library.items.filter(item => item.videoId !== reference.videoId)]
  localStorage.setItem(KEY, JSON.stringify(library))
}

export function selectPracticeReference(projectId: string, url: string | null): void {
  const library = loadReferenceLibrary()
  const videoId = url ? parseYoutubeVideoId(url) : null
  if (videoId) library.selected[projectId] = videoId
  else delete library.selected[projectId]
  localStorage.setItem(KEY, JSON.stringify(library))
}

export function getSelectedReferenceUrl(projectId: string): string | null {
  const videoId = loadReferenceLibrary().selected[projectId]
  return typeof videoId === 'string' && /^[\w-]{11}$/.test(videoId) ? buildYoutubeProxyUrl(videoId) : null
}

export function removePracticeReference(videoId: string): void {
  const library = loadReferenceLibrary()
  library.items = library.items.filter(item => item.videoId !== videoId)
  // Removing a bookmark doesn't interrupt the reference currently on a desk.
  localStorage.setItem(KEY, JSON.stringify(library))
}

export async function searchPracticeReferences(query: string, signal: AbortSignal): Promise<PracticeReference[]> {
  const endpoint = import.meta.env.VITE_YOUTUBE_SEARCH_ENDPOINT
  if (!endpoint) throw new Error('Reference search is not available yet. You can still load a link or choose a saved reference.')
  const url = new URL(endpoint, window.location.origin)
  url.searchParams.set('q', query.trim().slice(0, 160))
  let response: Response
  try { response = await fetch(url, { signal }) }
  catch (error) {
    if (signal.aborted) throw error
    throw new Error('Could not connect. Try again, or choose a saved reference.')
  }
  if (!response.ok) throw new Error(response.status === 429
    ? 'Search is busy right now. Try again shortly, or choose a saved reference.'
    : 'Search is unavailable right now. Try again, or load a YouTube link.')
  let data: { items?: unknown }
  try { data = await response.json() }
  catch { throw new Error('Search returned an unexpected response. Please try again.') }
  if (!Array.isArray(data.items)) throw new Error('Search returned an unexpected response. Please try again.')
  return data.items.filter((item: PracticeReference) => item && /^[\w-]{11}$/.test(item.videoId)
    && typeof item.title === 'string' && typeof item.channel === 'string')
}
