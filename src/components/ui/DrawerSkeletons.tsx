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
    <div className="settings-sheet space-y-6 pb-2" aria-hidden>
      {[2, 3, 2].map((rows, group) => (
        <div key={group}>
          <div className="set-skeleton-title" />
          <div className="set-skeleton-list">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="set-skeleton-row">
                <div className="set-skeleton-tile" />
                <div
                  className="set-skeleton-bar"
                  style={{ width: `${7 + ((group + row) % 3) * 2}rem` }}
                />
                <div className="ml-auto set-skeleton-switch" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
