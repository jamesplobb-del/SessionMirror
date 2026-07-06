export type LibraryItemKind = 'audio'

export interface LibraryItem {
  id: string
  projectId: string
  kind: LibraryItemKind
  name: string
  createdAt: number
  filePath: string
  mimeType: string
  duration: number
}

export type BenchmarkSource = 'take' | 'library'

export interface BenchmarkBinding {
  source: BenchmarkSource
  refId: string
}

/** Playback-facing view for Best Take box — not a recorded Take. */
export interface LibraryPlaybackReference {
  id: string
  name: string
  playbackUrl: string
  filePath: string
  mimeType: string
}
