/** Full-screen boot gate — shown until vault/filesystem init completes. */

const APP_ICON_SRC = '/icons/icon.png'

export default function AppBootGate() {
  return (
    <div
      className="app-boot-gate fixed inset-0 z-[500] flex items-center justify-center bg-black"
      aria-live="polite"
      aria-busy="true"
      aria-label="Starting BestTake"
    >
      <div className="app-boot-gate__ambient pointer-events-none absolute inset-0" aria-hidden />

      <div className="app-boot-gate__brand relative flex flex-col items-center">
        <div className="app-boot-gate__logo-shell">
          <img
            src={APP_ICON_SRC}
            alt=""
            width={80}
            height={80}
            className="app-boot-gate__logo h-20 w-20 rounded-[22%] object-cover"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <h1 className="app-boot-gate__title mt-5 text-[1.375rem] font-semibold tracking-[-0.03em] text-white">
          BestTake
        </h1>
      </div>
    </div>
  )
}
