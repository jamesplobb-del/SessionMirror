/** Dark shimmer placeholder while a vault take thumbnail is still loading. */
export default function TakeCardThumbnailSkeleton() {
  return (
    <div className="vault-thumb-skeleton relative h-full w-full overflow-hidden bg-stone-900" aria-hidden>
      <div className="vault-thumb-skeleton__shimmer absolute inset-0" />
    </div>
  )
}
