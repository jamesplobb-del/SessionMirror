import type { AppSettings } from './appSettings'

/** Toggles owned by the Camera/Audio Mode Workspace menu. */
export type HudQuickSettings = Pick<
  AppSettings,
  'pitchTrackerEnabled' | 'showTakeCards' | 'showMetronome' | 'showDrone' | 'audioEnhancerEnabled'
>

export const HUD_QUICK_SETTING_KEYS = [
  'pitchTrackerEnabled',
  'showTakeCards',
  'showMetronome',
  'showDrone',
  'audioEnhancerEnabled',
] as const satisfies ReadonlyArray<keyof HudQuickSettings>

export function pickHudQuickSettings(settings: AppSettings): HudQuickSettings {
  return {
    pitchTrackerEnabled: settings.pitchTrackerEnabled,
    showTakeCards: settings.showTakeCards,
    showMetronome: settings.showMetronome,
    showDrone: settings.showDrone,
    audioEnhancerEnabled: settings.audioEnhancerEnabled,
  }
}
