import MetronomeAudioSelect, {
  type MetronomeAudioSelectOption,
} from '../../components/audioPractice/MetronomeAudioSelect'

interface TimelineEditorSelectProps<T extends string> {
  label: string
  ariaLabel: string
  value: T
  options: MetronomeAudioSelectOption<T>[]
  onChange: (value: T) => void
}

/** Dropdown for practice timeline editors — same control as the Metronome tab. */
export default function TimelineEditorSelect<T extends string>(props: TimelineEditorSelectProps<T>) {
  return <MetronomeAudioSelect {...props} />
}
