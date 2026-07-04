import { Mic, Square, Trash2 } from 'lucide-react'
import { formatTime } from '../hooks/useVideoPlayback'
import type { MultitrackBox } from './types'
import Pressable from '../components/ui/Pressable'

interface MultitrackWorkflowProps {
  boxes: MultitrackBox[]
  isRecording: boolean
  hasBacking: boolean
  onStartRecord: () => void
  onStopRecord: () => void
  onRemoveBox: (boxId: string) => void
}

export default function MultitrackWorkflow({
  boxes,
  isRecording,
  hasBacking,
  onStartRecord,
  onStopRecord,
  onRemoveBox,
}: MultitrackWorkflowProps) {
  return (
    <section className="multitrack-workflow">
      <h3 className="multitrack-workflow__title">Performance boxes</h3>
      <p className="multitrack-workflow__lead">
        Record Box 1 over the backing, then add Box 2 while hearing backing + prior boxes.
      </p>

      <ol className="multitrack-workflow__list">
        {boxes.map((box) => (
          <li key={box.id} className="multitrack-workflow__item">
            <span>
              {box.name}
              {box.duration > 0 ? ` · ${formatTime(box.duration)}` : ''}
            </span>
            <Pressable
              type="button"
              intensity="soft"
              aria-label={`Remove ${box.name}`}
              onClick={() => onRemoveBox(box.id)}
            >
              <Trash2 size={16} />
            </Pressable>
          </li>
        ))}
      </ol>

      {isRecording ? (
        <Pressable type="button" intensity="normal" className="multitrack-workflow__record-btn" onClick={onStopRecord}>
          <Square size={16} />
          Stop recording
        </Pressable>
      ) : (
        <Pressable
          type="button"
          intensity="normal"
          className="multitrack-workflow__record-btn"
          disabled={!hasBacking}
          onClick={onStartRecord}
        >
          <Mic size={16} />
          Record Box {boxes.length + 1}
        </Pressable>
      )}
    </section>
  )
}
