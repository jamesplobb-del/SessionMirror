import { motion } from 'framer-motion'
import LiveMetronomeStage from './LiveMetronomeStage'

interface MetronomeStagePresenterProps {
  isTakePlaying?: boolean
  muteDuringPlayback?: boolean
  layoutRegion?: 'main' | 'review'
}

export default function MetronomeStagePresenter({
  isTakePlaying = false,
  muteDuringPlayback = true,
  layoutRegion = 'main',
}: MetronomeStagePresenterProps) {
  return (
    <motion.div
      key="audio-metronome-stage"
      className={`metronome-widget-audio metronome-widget-audio--${layoutRegion} metronome-widget-audio--stage pointer-events-none absolute z-[5] flex min-h-0 flex-col`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="metronome-widget-audio__stage relative flex min-h-0 max-h-full w-full flex-col">
        <LiveMetronomeStage
          isTakePlaying={isTakePlaying}
          muteDuringPlayback={muteDuringPlayback}
        />
      </div>
    </motion.div>
  )
}
