import AudioPracticeMetronomeView from './AudioPracticeMetronomeView'

export default function AudioMetronomeTab() {
  return (
    <section
      className="audio-practice-metronome-shell flex min-h-0 flex-1 flex-col"
      aria-label="Metronome practice"
    >
      <AudioPracticeMetronomeView />
    </section>
  )
}
