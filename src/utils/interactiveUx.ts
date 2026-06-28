/** Shared tactile press styling for native-feeling controls. */
export const NATIVE_SQUISH =
  'select-none transition-all duration-200 ease-out active:scale-95 [-webkit-tap-highlight-color:transparent]'

/** Record HUD chrome — opaque glass without backdrop-filter (GPU-friendly over live camera). */
export const HUD_SOLID_BTN =
  '[-webkit-tap-highlight-color:transparent] select-none border-[0.5px] border-white/10 bg-black/55 text-white shadow-lg transition-opacity duration-200 ease-out hover:bg-black/70'

export const HUD_SOLID_FLOAT_BADGE =
  'pointer-events-auto absolute z-30 flex h-7 w-7 items-center justify-center rounded-full border-[0.5px] border-white/10 bg-black/55 text-white shadow-[0_1px_6px_rgba(0,0,0,0.45)] transition-opacity duration-200 ease-out hover:bg-black/70'

export const HUD_SOLID_PIP_PLAY_ICON =
  'flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white/90 transition-opacity duration-200 ease-out hover:bg-black/70'

/** Glass chrome for pip badges — styled in camera-mode-glass.css */
export const HUD_GLASS_FLOAT_BADGE = `${HUD_SOLID_FLOAT_BADGE} hud-glass-badge`

export const HUD_GLASS_PIP_PLAY_ICON = `${HUD_SOLID_PIP_PLAY_ICON} hud-glass-badge`

/** Framer-motion glide-in for modals, menus, and panels. */
export const nativeGlideTransition = {
  duration: 0.3,
  ease: 'easeOut' as const,
}

export const nativeGlideIn = { opacity: 0, y: 16 }
export const nativeGlideShown = { opacity: 1, y: 0 }
