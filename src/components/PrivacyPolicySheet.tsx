import { X } from 'lucide-react'
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_SECTIONS,
  PRIVACY_SUMMARY,
} from '../utils/privacyPolicy'
import AnimatedBottomSheet from './ui/AnimatedBottomSheet'
import Pressable from './ui/Pressable'

interface PrivacyPolicySheetProps {
  isOpen: boolean
  onClose: () => void
}

/** The full policy, readable offline — same sheet chrome as Learn the App. */
export default function PrivacyPolicySheet({ isOpen, onClose }: PrivacyPolicySheetProps) {
  return (
    <AnimatedBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      ariaLabel="Privacy policy"
      maxHeightClass="max-h-[min(82vh,44rem)]"
      motionPreset="premium"
      elevated
      elevatedLight
    >
      {isOpen && (
        <>
          <div className="help-sheet__header native-sheet-header sticky top-0 z-20 flex shrink-0 items-center justify-between gap-4 border-b border-white/60 px-5 pb-4 pt-3">
            <div className="min-w-0">
              <span className="native-sheet-kicker">Help</span>
              <h2 className="native-sheet-title">Privacy policy</h2>
            </div>
            <Pressable
              type="button"
              intensity="icon"
              haptic="light"
              onClick={onClose}
              className="native-sheet-close relative z-30 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 text-stone-500 shadow-sm ring-1 ring-stone-200/70 hover:bg-white hover:text-stone-800"
              aria-label="Close privacy policy"
            >
              <X className="h-5 w-5" />
            </Pressable>
          </div>
          <div className="help-sheet__body privacy-policy min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-4">
            <p className="help-sheet__intro">{PRIVACY_SUMMARY}</p>
            {PRIVACY_SECTIONS.map((section) => (
              <section key={section.title} className="privacy-policy__section">
                <h3>{section.title}</h3>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets ? (
                  <ul>
                    {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                  </ul>
                ) : null}
              </section>
            ))}
            <section className="privacy-policy__section">
              <h3>Contact</h3>
              <p>
                Questions about privacy:{' '}
                <a href={`mailto:${PRIVACY_CONTACT_EMAIL}?subject=${encodeURIComponent('BestTake privacy')}`}>
                  {PRIVACY_CONTACT_EMAIL}
                </a>
              </p>
              <p className="privacy-policy__date">Effective {PRIVACY_EFFECTIVE_DATE}</p>
            </section>
          </div>
        </>
      )}
    </AnimatedBottomSheet>
  )
}
