import { AudioLines } from 'lucide-react'

/** Phase 1 placeholder — focused tuner view ships in a later phase. */
export default function AudioTunerTab() {
  return (
    <section className="audio-practice-placeholder" aria-label="Tuner">
      <div className="audio-practice-placeholder__icon-wrap">
        <AudioLines className="h-8 w-8 text-sky-300" aria-hidden />
      </div>
      <h2 className="audio-practice-placeholder__title">Tuner</h2>
      <p className="audio-practice-placeholder__body">
        Focused pitch analysis view coming soon — reuses the existing live tuner without
        changing detection logic.
      </p>
      <p className="audio-practice-placeholder__todo">TODO: Phase 2 — tuner presentation</p>
    </section>
  )
}
