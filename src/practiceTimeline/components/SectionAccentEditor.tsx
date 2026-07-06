import { cycleAccentLevel } from '../../metronome/metronomeTiming'
import type { MetronomeAccentLevel } from '../../utils/metronomeConfig'
import Pressable from '../../components/ui/Pressable'

const LEVEL_LABEL: Record<MetronomeAccentLevel, string> = {
  strong: 'Strong',
  medium: 'Medium',
  weak: 'Weak',
  silent: 'Silent',
}

interface SectionAccentEditorProps {
  pulseCount: number
  accentLevels: MetronomeAccentLevel[]
  onChange: (levels: MetronomeAccentLevel[]) => void
}

export default function SectionAccentEditor({
  pulseCount,
  accentLevels,
  onChange,
}: SectionAccentEditorProps) {
  return (
    <div className="practice-timeline-editor__accent-row">
      {Array.from({ length: pulseCount }, (_, index) => {
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
              while (next.length < pulseCount) next.push('weak')
              next[index] = cycleAccentLevel(level)
              onChange(next.slice(0, pulseCount))
            }}
          >
            {index + 1}
          </Pressable>
        )
      })}
    </div>
  )
}
