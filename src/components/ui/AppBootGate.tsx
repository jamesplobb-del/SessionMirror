/** Full-screen boot gate — shown until vault/filesystem init completes. */

export default function AppBootGate() {
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-[#0A0F1C]"
      aria-live="polite"
      aria-busy="true"
      aria-label="Starting BestTake"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 42%, rgba(251, 191, 36, 0.14) 0%, transparent 62%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-4">
        <h1
          className="animate-pulse text-2xl font-semibold tracking-tight text-slate-50 duration-1000"
          style={{
            textShadow:
              '0 0 24px rgba(251, 191, 36, 0.4), 0 0 48px rgba(251, 191, 36, 0.18)',
          }}
        >
          BestTake
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-400/90">
          Session Mirror
        </p>
      </div>
    </div>
  )
}
