import { ChevronDown, Youtube } from 'lucide-react'
import './practice-tool-strip.css'

/** Reference entry stays available; floating tools own their own collapse balls. */
export default function PracticeToolStrip({ reference, referenceReady,
  onReference, light, referenceExpanded, disabled = false,
}: {
  reference: boolean; referenceReady: boolean; onReference: () => void
  light: boolean; referenceExpanded: boolean; disabled?: boolean
}) {
  if (!reference) return null
  return <nav className={`practice-tool-strip${light ? ' practice-tool-strip--light' : ''}`} aria-label="Practice tools in use">
    {reference && <button disabled={disabled} aria-expanded={referenceExpanded} onClick={onReference} aria-label={referenceExpanded ? 'Collapse reference' : referenceReady ? 'Open reference' : 'Find a reference: search YouTube or paste a link'}>
      <Youtube aria-hidden /><span>{referenceReady ? 'Reference' : 'Find reference'}</span><ChevronDown aria-hidden /></button>}
  </nav>
}
