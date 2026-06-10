/** Lightweight placeholders shown while drawer slide animations run. */

export function VaultDrawerSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-stone-200" />
        <div className="flex gap-2 overflow-hidden">
          <div className="h-8 w-24 shrink-0 animate-pulse rounded-lg bg-stone-100" />
          <div className="h-8 w-28 shrink-0 animate-pulse rounded-lg bg-stone-100" />
          <div className="h-8 w-24 shrink-0 animate-pulse rounded-lg bg-stone-100" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-stone-100" />
        <div className="h-4 w-16 animate-pulse rounded bg-stone-200" />
      </div>

      <div className="flex items-start gap-4 overflow-hidden pb-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="w-56 shrink-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
          >
            <div className="aspect-video w-full animate-pulse bg-stone-200" />
            <div className="space-y-2 px-3 py-3">
              <div className="h-3.5 w-3/4 animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-stone-100" />
            </div>
          </div>
        ))}
      </div>
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
              <div className="h-4 w-40 animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-full animate-pulse rounded bg-stone-100" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-stone-100" />
            </div>
            <div className="h-7 w-12 shrink-0 animate-pulse rounded-full bg-stone-200" />
          </div>
        </div>
      ))}
    </div>
  )
}
