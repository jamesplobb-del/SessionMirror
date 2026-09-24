import { AudioLines } from 'lucide-react'
import '../styles/audio-take-poster.css'

export default function AudioTakePoster({ name }: { name?: string | null }) {
  return (
    <div className="audio-take-poster absolute inset-0" aria-hidden>
      <AudioLines className="audio-take-poster__mark" strokeWidth={1.5} />
      {name ? <span className="audio-take-poster__name">{name}</span> : null}
    </div>
  )
}
