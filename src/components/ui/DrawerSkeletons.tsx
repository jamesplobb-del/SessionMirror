/** Lightweight placeholders shown while drawer slide animations run. */

export function VaultDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="vault-skeleton-line h-10 w-full rounded-xl" />
      <div className="vault-skeleton-line h-10 w-full rounded-full" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="vault-skeleton-line h-8 w-16 rounded-full" />
        ))}
      </div>
      <div className="vault-skeleton-line h-8 w-28 rounded-lg" />
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="vault-skeleton-row">
          <div className="vault-skeleton-thumb" />
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1">
            <div className="vault-skeleton-line w-3/5" />
            <div className="vault-skeleton-line w-2/5" />
            <div className="vault-skeleton-line w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SettingsDrawerSkeleton() {
  return (
    <div className="space-y-6 pb-2" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-stone-200 bg-white px-4 py-3.5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-stone-200/90" />
              <div className="h-3 w-full rounded bg-stone-100" />
              <div className="h-3 w-4/5 rounded bg-stone-100" />
            </div>
            <div className="h-7 w-12 shrink-0 rounded-full bg-stone-200/90" />
          </div>
        </div>
      ))}
    </div>
  )
}
