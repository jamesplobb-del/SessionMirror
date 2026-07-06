import { CheckCircle2, X } from 'lucide-react'
import type { HelpTopic } from '../utils/tutorialContent'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import Pressable from './ui/Pressable'

interface HelpSheetProps {
  topic: HelpTopic | null
  onClose: () => void
}

export default function HelpSheet({ topic, onClose }: HelpSheetProps) {
  return (
    <AnimatedBottomSheet
      isOpen={topic !== null}
      onClose={onClose}
      ariaLabel={topic?.title ?? 'Learn the App'}
      maxHeightClass="max-h-[min(58vh,34rem)]"
      motionPreset="premium"
      elevated
      elevatedLight
    >
      {topic && (
        <>
          <div className="help-sheet__header native-sheet-header sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b border-white/60 px-5 pb-4 pt-3">
            <div className="min-w-0">
              <span className="native-sheet-kicker">Learn the App</span>
              <h2 className="native-sheet-title">{topic.title}</h2>
            </div>
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              onClick={onClose}
              className="native-sheet-close relative z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-stone-500 shadow-sm ring-1 ring-stone-200/70 hover:bg-white hover:text-stone-800"
              aria-label="Close help"
            >
              <X className="h-5 w-5" />
            </Pressable>
          </div>
          <div className="help-sheet__body min-h-0 flex-1 overflow-y-auto px-5 pb-7 pt-4">
            <p className="help-sheet__intro">{topic.body}</p>
            <div className="mt-4 space-y-2.5">
              {topic.bullets.map((bullet) => (
                <div key={bullet} className="help-sheet__bullet">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AnimatedBottomSheet>
  )
}
