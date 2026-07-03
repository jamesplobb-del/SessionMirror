import { cycleAccentLevel } from '../../metronome/metronomeTiming'
import type { MetronomeAccentLevel } from '../../utils/metronomeConfig'
import Pressable from '../../components/ui/Pressable'
import { getBeatsPerBar } from '../../utils/metronomeConfig'
import type { MetronomeMeter } from '../../utils/metronomeConfig'

const LEVEL_LABEL: Record<MetronomeAccentLevel, string> = {
  strong: 'Strong',
  medium: 'Medium',
  weak: 'Weak',
  silent: 'Silent',
}

interface SectionAccentEditorProps {
  meter: MetronomeMeter
  accentLevels: MetronomeAccentLevel[]
  onChange: (levels: MetronomeAccentLevel[]) => void
}

export default function SectionAccentEditor({
  meter,
  accentLevels,
  onChange,
}: SectionAccentEditorProps) {
  const beats = getBeatsPerBar(meter)

  return (
    <div className="practice-timeline-editor__accent-row">
      {Array.from({ length: beats }, (_, index) => {
        const level = accentLevels[index] ?? 'weak'
        return (
          <Pressable
            key={index}
            type="button"
            intensity="soft"
            className={`practice-timeline-editor__accent-beat practice-timeline-editor__accent-beat--${level}`}
            aria-label={`Beat ${index + 1}, ${LEVEL_LABEL[level]}. Tap to change.`}
            onClick={() => {
              const next = [...accentLevels]
              while (next.length < beats) next.push('weak')
              next[index] = cycleAccentLevel(level)
              onChange(next.slice(0, beats))
            }}
          >
            {index + 1}
          </Pressable>
        )
      })}
    </div>
  )
}
