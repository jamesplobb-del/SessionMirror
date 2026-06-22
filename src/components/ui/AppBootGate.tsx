/** Full-screen boot gate — shown until vault/filesystem init completes. */

export default function AppBootGate() {
  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center bg-black"
      aria-live="polite"
      aria-busy="true"
      aria-label="Starting BestTake"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 42%, rgba(92, 230, 37, 0.12) 0%, transparent 62%)',
        }}
      />
      <div className="relative flex flex-col items-center gap-4">
        <h1
          className="animate-pulse text-2xl font-semibold tracking-tight text-white duration-1000"
          style={{
            textShadow:
              '0 0 24px rgba(92, 230, 37, 0.35), 0 0 48px rgba(92, 230, 37, 0.14)',
          }}
        >
          BestTake
        </h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#5ce625]/90">
          Session Mirror
        </p>
      </div>
    </div>
  )
}
