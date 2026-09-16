import { useRef } from 'react'
import { FolderOpen, Share2 } from 'lucide-react'
import Pressable from '../../components/ui/Pressable'

export default function ProjectFileActions({ busy, onShare, onImport }: {
  busy: boolean
  onShare: () => void
  onImport: (file: File) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="multitrack-project-file-actions">
    <Pressable type="button" intensity="soft" className="multitrack-toolbar__chip" disabled={busy} onClick={onShare}>
      <Share2 aria-hidden />{busy ? 'Working…' : 'Share project'}
    </Pressable>
    <Pressable type="button" intensity="soft" className="multitrack-toolbar__chip" disabled={busy} onClick={() => input.current?.click()}>
      <FolderOpen aria-hidden />Open project
    </Pressable>
    <input ref={input} hidden type="file" accept=".btmulti,application/octet-stream" disabled={busy}
      aria-label="Open multitrack project file" onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) onImport(file)
      }} />
  </div>
}
