import SimpleSegmentedControl from './ui/SimpleSegmentedControl'

export type VaultSection = 'takes' | 'library'

interface VaultSectionTabsProps {
  value: VaultSection
  onChange: (value: VaultSection) => void
  takesCount: number
  libraryCount: number
}

export default function VaultSectionTabs({
  value,
  onChange,
  takesCount,
  libraryCount,
}: VaultSectionTabsProps) {
  return (
    <SimpleSegmentedControl
      className="vault-section-tabs"
      ariaLabel="Vault section"
      value={value}
      onChange={onChange}
      segments={[
        {
          id: 'takes' as const,
          label: (
            <>
              Takes
              {takesCount > 0 && (
                <span className="ml-1.5 text-xs text-stone-400">({takesCount})</span>
              )}
            </>
          ),
        },
        {
          id: 'library' as const,
          label: (
            <>
              Library
              {libraryCount > 0 && (
                <span className="ml-1.5 text-xs text-stone-400">({libraryCount})</span>
              )}
            </>
          ),
        },
      ]}
    />
  )
}
