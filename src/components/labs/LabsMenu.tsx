import Pressable from '../ui/Pressable'

interface LabsMenuProps {
  onOpenScaleRush: () => void
  onBack: () => void
}

export default function LabsMenu({ onOpenScaleRush, onBack }: LabsMenuProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 py-8">
      <header className="mb-10">
        <Pressable
          type="button"
          intensity="soft"
          onClick={onBack}
          className="mb-6 text-sm font-medium text-stone-500"
        >
          ← Back
        </Pressable>
        <h1 className="text-2xl font-semibold text-stone-900">BestTake Labs</h1>
        <p className="mt-2 text-sm text-stone-500">Experimental prototypes. Not for production use.</p>
      </header>

      <ul className="space-y-3">
        <li>
          <Pressable
            type="button"
            intensity="soft"
            onClick={onOpenScaleRush}
            className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4 text-left"
          >
            <span className="text-base font-semibold text-stone-900">Scale Rush</span>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Beta
            </span>
          </Pressable>
        </li>
      </ul>
    </div>
  )
}
