/** Shared tactile press styling for native-feeling controls. */
export const NATIVE_SQUISH =
  'select-none transition-all duration-200 ease-out active:scale-95 [-webkit-tap-highlight-color:transparent]'

/** Framer-motion glide-in for modals, menus, and panels. */
export const nativeGlideTransition = {
  duration: 0.3,
  ease: 'easeOut' as const,
}

export const nativeGlideIn = { opacity: 0, y: 16 }
export const nativeGlideShown = { opacity: 1, y: 0 }
