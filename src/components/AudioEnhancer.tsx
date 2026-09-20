import { Capacitor } from '@capacitor/core'
import { DEFAULT_AUDIO_ENHANCER_SETTINGS, type AudioEnhancerSettings } from '../utils/audioEnhancer'

export default function AudioEnhancer({ settings, onChange }: {
  settings: AudioEnhancerSettings
  onChange: (next: AudioEnhancerSettings) => void
}) {
  const amount = settings.amount ?? 60
  return <div className="space-y-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
    <div>
      <p className="text-sm font-semibold text-stone-800">Natural instrument sound</p>
      <p className="mt-1 text-xs leading-relaxed text-stone-600">
        Gently reduces steady background noise when it can be identified, protects note attacks and sustain,
        and brings quiet takes forward. No added reverb or stereo effects.
      </p>
    </div>
    <label className="block space-y-2 text-xs text-stone-700">
      <span className="flex justify-between"><span>Enhancement amount</span><span>{amount}%</span></span>
      <input aria-label="Enhancement amount" type="range" min={0} max={100} step={5} value={amount}
        className="w-full accent-stone-700"
        onChange={event => onChange({ ...DEFAULT_AUDIO_ENHANCER_SETTINGS, ...settings, version: 2, amount: Number(event.target.value) })} />
      <span className="flex justify-between text-stone-500"><span>Original</span><span>More cleanup</span></span>
    </label>
    <label className="flex items-start gap-3 text-xs text-stone-700">
      <input type="checkbox" checked={settings.matchOriginalLevel === true}
        onChange={event => onChange({ ...settings, version: 2, matchOriginalLevel: event.target.checked })} />
      <span>Match original volume<span className="mt-1 block text-stone-500">Compare the cleanup without the extra loudness.</span></span>
    </label>
    <p className="text-xs leading-relaxed text-stone-500">Turn Audio Enhance off to hear the original. Changes apply when you play again. Your original recording is always kept.</p>
    {!Capacitor.isNativePlatform() && <p className="text-xs text-stone-500">Automatic cleanup runs in the iPhone and iPad app. This browser preview plays the original.</p>}
  </div>
}
