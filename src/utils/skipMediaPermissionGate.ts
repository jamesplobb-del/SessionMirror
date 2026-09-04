/**
 * Hide the camera/mic permission overlay so the rest of the app can be used
 * in a browser without granting devices (Games lobby, Tools tabs, chrome).
 *
 * On only while Vite is in `npm run dev`. Production and `ios:refresh` builds
 * inline `import.meta.env.DEV` as false, so the overlay is back with no flag
 * to remember at launch. Recording and the games still need a real mic; this
 * only skips the full-screen gate.
 */
export const SKIP_MEDIA_PERMISSION_GATE = import.meta.env.DEV
