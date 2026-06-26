import { Timer } from 'lucide-react'

/** Phase 1 placeholder — full metronome practice view ships in a later phase. */
export default function AudioMetronomeTab() {
  return (
    <section className="audio-practice-placeholder" aria-label="Metronome practice">
      <div className="audio-practice-placeholder__icon-wrap">
        <Timer className="h-8 w-8 text-sky-300" aria-hidden />
      </div>
      <h2 className="audio-practice-placeholder__title">Metronome</h2>
      <p className="audio-practice-placeholder__body">
        Dedicated metronome practice view coming soon — BPM, tap tempo, time signatures,
        subdivisions, and visual beat pulse.
      </p>
      <p className="audio-practice-placeholder__todo">TODO: Phase 2 — metronome controls</p>
    </section>
  )
}
