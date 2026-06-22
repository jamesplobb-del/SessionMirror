import type { AppSettings } from './appSettings'

/** Toggles exposed in the long-press settings branch wheel and mirrored in Settings. */
export type HudQuickSettings = Pick<
  AppSettings,
  'pitchTrackerEnabled' | 'showTakeCards' | 'showMetronome' | 'audioEnhancerEnabled'
>

export const HUD_QUICK_SETTING_KEYS = [
  'pitchTrackerEnabled',
  'showTakeCards',
  'showMetronome',
  'audioEnhancerEnabled',
] as const satisfies ReadonlyArray<keyof HudQuickSettings>

export function pickHudQuickSettings(settings: AppSettings): HudQuickSettings {
  return {
    pitchTrackerEnabled: settings.pitchTrackerEnabled,
    showTakeCards: settings.showTakeCards,
    showMetronome: settings.showMetronome,
    audioEnhancerEnabled: settings.audioEnhancerEnabled,
  }
}
