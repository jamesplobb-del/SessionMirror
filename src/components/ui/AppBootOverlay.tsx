/** Shown while vault metadata and camera HUD finish bootstrapping. */

export default function AppBootOverlay() {
  return (
    <div
      className="app-boot-overlay pointer-events-none fixed inset-0 z-[200] flex items-center justify-center bg-black/45 backdrop-blur-sm"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading session"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-black/70 px-6 py-5 shadow-2xl">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[#5ce625]"
          aria-hidden
        />
        <p className="text-xs font-medium tracking-wide text-white/75">Loading session…</p>
      </div>
    </div>
  )
}
