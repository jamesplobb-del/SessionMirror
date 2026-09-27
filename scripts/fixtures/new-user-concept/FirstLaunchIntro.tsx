import OnboardingTutorial from '../../../src/components/OnboardingTutorial'

interface FirstLaunchIntroProps {
  onComplete: () => void
  onSelectInstrument: (id: string) => void
  initialInstrumentId?: string
}

/** Share the shipping introduction; the surrounding demo owns sample state. */
export default function FirstLaunchIntro(props: FirstLaunchIntroProps) {
  return <OnboardingTutorial {...props} onSkip={props.onComplete} hapticFeedback={false} />
}
