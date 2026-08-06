import AudioPracticeMetronomeView from './AudioPracticeMetronomeView'

interface AudioMetronomeTabProps {
  onOpenProgram?: () => void
}

export default function AudioMetronomeTab({ onOpenProgram }: AudioMetronomeTabProps) {
  return (
    <section
      className="audio-practice-metronome-shell flex min-h-0 flex-1 flex-col"
      aria-label="Metronome practice"
    >
      <AudioPracticeMetronomeView onOpenProgram={onOpenProgram} />
    </section>
  )
}
