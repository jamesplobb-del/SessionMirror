import { Layers } from 'lucide-react'

/** Phase 1 placeholder — combined tuner + metronome ships in a later phase. */
export default function AudioComboTab() {
  return (
    <section className="audio-practice-placeholder" aria-label="Tuner and metronome">
      <div className="audio-practice-placeholder__icon-wrap">
        <Layers className="h-8 w-8 text-sky-300" aria-hidden />
      </div>
      <h2 className="audio-practice-placeholder__title">Tuner + Met</h2>
      <p className="audio-practice-placeholder__body">
        Combined tuner and metronome practice view coming soon — large tuner with a metronome
        strip below.
      </p>
      <p className="audio-practice-placeholder__todo">TODO: Phase 2 — combo layout</p>
    </section>
  )
}
