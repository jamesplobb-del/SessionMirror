import type { MultitrackPracticeSettings } from '../types'
import { useHeadphoneOutput } from '../../hooks/useHeadphoneOutput'
import { useActionSheet } from '../../context/ActionSheetContext'
import IOSSwitch from '../../components/ui/IOSSwitch'
import Pressable from '../../components/ui/Pressable'
import MultitrackClickSettings from './MultitrackClickSettings'
import { recordingCountInBars } from '../recording/multitrackCountIn'
export default function MultitrackCountInControls({ practice, onChange, hasBacking = false }: { practice: MultitrackPracticeSettings; onChange: (patch: Partial<MultitrackPracticeSettings>) => void; hasBacking?: boolean }) {
  const headphonesConnected = useHeadphoneOutput()
  const { showAlert } = useActionSheet()
  const countInBars = recordingCountInBars(practice.countInBars)
  return (
          <div className="multitrack-countin-sheet">
            <label className="multitrack-countin-sheet__row">
              <span>Click during recording</span>
              <IOSSwitch
                checked={practice.clickEnabled && headphonesConnected}
                onChange={(clickEnabled) => {
                  if (clickEnabled && !headphonesConnected) {
                    void showAlert({
                      title: 'Connect headphones for a click track',
                      message:
                        'On the speaker the click bleeds into your recording. Plug in or connect headphones (wired or Bluetooth) to run the click while you record. Your count-in still plays either way.',
                    })
                    return
                  }
                  onChange({ clickEnabled })
                }}
              />
            </label>
            <p className="multitrack-countin-sheet__hint">
              {headphonesConnected
                ? 'Headphones connected, so the click can run through the whole take without printing into your recording.'
                : 'Needs headphones: through the speaker the microphone picks the click up and prints it into the take. Without them you still get the lead-in count-in below, then silence to play against.'}
            </p>
            {hasBacking && !practice.clickEnabled ? (
              <p className="multitrack-countin-sheet__hint">
                Off by default with a backing track — its tempo rarely matches the click. Turn it on
                if your backing really is at {Math.round(practice.bpm)} BPM.
              </p>
            ) : null}
            <label className="multitrack-countin-sheet__row">
              <span>Count-in bars</span>
              <div className="multitrack-recording-stage__stepper">
                <Pressable
                  type="button"
                  intensity="icon"
                  aria-label="Decrease count-in bars"
                  disabled={countInBars <= 1}
                  onClick={() => onChange({ countInBars: Math.max(1, countInBars - 1) })}
                >
                  -
                </Pressable>
                <strong>{countInBars}</strong>
                <Pressable
                  type="button"
                  intensity="icon"
                  aria-label="Increase count-in bars"
                  disabled={countInBars >= 8}
                  onClick={() => onChange({ countInBars: Math.min(8, countInBars + 1) })}
                >
                  +
                </Pressable>
              </div>
            </label>
            <p className="multitrack-countin-sheet__hint">Every recording starts with a count-in. The click switch only changes what plays after it.</p>
            <MultitrackClickSettings
              practice={practice}
              onChange={onChange}
            />
          </div>
  )
}
