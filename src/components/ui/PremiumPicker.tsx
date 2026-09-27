import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { premiumMotion } from '../../utils/premiumMotion'
import { PremiumMotionDiv, PremiumMotionSection } from './PremiumMotionSurface'
import Pressable from './Pressable'
import '../../styles/premium-controls.css'

export interface PremiumPickerOption<T extends string> {
  value: T
  label: string
  hint?: string
  group?: string
  glyph?: ReactNode
  disabled?: boolean
  section?: boolean
}

interface PremiumPickerProps<T extends string> {
  isOpen: boolean
  title: string
  value: T
  options: PremiumPickerOption<T>[]
  onChange: (value: T) => void
  onClose: () => void
  searchable?: boolean
  description?: string
  hapticFeedback?: boolean
}

/** One modal picker for instruments, programs and tool menus. A portal keeps
 * it clear of scrolling panels; exiting surfaces immediately release input. */
export function PremiumPicker<T extends string>({
  isOpen, title, value, options, onChange, onClose, searchable = false, description, hapticFeedback = true,
}: PremiumPickerProps<T>) {
  const [search, setSearch] = useState('')
  const layer = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const reduced = useReducedMotion()
  const filtered = useMemo(() => options.filter(option =>
    !search.trim() || !option.section && `${option.label} ${option.group ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [options, search])

  useEffect(() => {
    if (!isOpen) return
    setSearch('')
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings = Array.from(document.body.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== layer.current)
    const inert = siblings.map(node => node.inert)
    siblings.forEach(node => { node.inert = true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Focus without bringing up the keyboard. Search is available deliberately.
    const frame = requestAnimationFrame(() => {
      panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
      panel.current?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
      siblings.forEach((node, index) => { node.inert = inert[index] })
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [isOpen])

  if (typeof document === 'undefined') return null
  return createPortal(<AnimatePresence>{isOpen && <PremiumMotionDiv
    ref={layer} className="premium-choice-layer"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    transition={premiumMotion({ duration: .1 }, 'backdrop')}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])
      const active = document.activeElement as HTMLElement
      if (active.tagName !== 'INPUT' && event.key.length === 1 && /\S/.test(event.key) && !event.metaKey && !event.ctrlKey) {
        const index = buttons.indexOf(active as HTMLButtonElement)
        const ordered = [...buttons.slice(index + 1), ...buttons.slice(0, index + 1)]
        ordered.find(button => button.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus()
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && (active.tagName !== 'INPUT' || event.key === 'ArrowDown')) {
        event.preventDefault()
        const index = buttons.indexOf(active as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length
        buttons[next]?.focus()
      }
      if (event.key === 'Tab') {
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [])
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && (active === first || !controls.includes(active))) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && (active === last || !controls.includes(active))) { event.preventDefault(); first?.focus() }
      }
    }}
  >
    <button type="button" className="premium-choice-backdrop" tabIndex={-1} aria-label={`Close ${title}`} onClick={onClose} />
    <PremiumMotionSection ref={panel} className="premium-choice-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined} tabIndex={-1}
      initial={{ y: reduced ? 0 : 48, scale: reduced ? 1 : .97 }}
      animate={{ y: 0, scale: 1 }} exit={{ y: reduced ? 0 : 28, scale: reduced ? 1 : .985 }}
      transition={premiumMotion({ duration: .1 }, 'panel')}>
      <div className="premium-choice-handle" aria-hidden />
      <header><h2 id={titleId}>{title}</h2><Pressable type="button" intensity="icon" hapticFeedback={hapticFeedback} aria-label={`Close ${title}`} onClick={onClose}><X aria-hidden /></Pressable></header>
      {description && <p className="premium-choice-description" id={descriptionId}>{description}</p>}
      {searchable && <label className="premium-choice-search"><Search aria-hidden /><input aria-label={`Search ${title.toLowerCase()}`} placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} /></label>}
      <div className="premium-choice-options" role="listbox" aria-label={title}>
        {filtered.map((option, index) => <div key={option.value} role="presentation">
          {option.group && option.group !== filtered[index - 1]?.group && <div className="premium-choice-group">{option.group}</div>}
          {option.section ? <div className="premium-choice-group">{option.label}</div> : <Pressable
            type="button" role="option" aria-selected={value === option.value} disabled={option.disabled}
            hapticFeedback={hapticFeedback} className="premium-choice-option"
            onClick={() => { if (value !== option.value) onChange(option.value); onClose() }}>
            {option.glyph && <span className="premium-choice-glyph" aria-hidden>{option.glyph}</span>}
            <span className="premium-choice-copy"><strong>{option.label}</strong>{option.hint && <small>{option.hint}</small>}</span>
            <span className="premium-choice-check" aria-hidden>{value === option.value && <Check />}</span>
          </Pressable>}
        </div>)}
        {!filtered.length && <p className="premium-choice-empty">No matches. Try another search.</p>}
      </div>
    </PremiumMotionSection>
  </PremiumMotionDiv>}</AnimatePresence>, document.body)
}

export default function PremiumSelect<T extends string>({ title, value, options, onChange, disabled, className = '', searchable, description, hapticFeedback }:
  Omit<PremiumPickerProps<T>, 'isOpen' | 'onClose'> & { disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const selected = options.find(option => option.value === value)
  return <>
    <Pressable type="button" className={`premium-select ${className}`} disabled={disabled} hapticFeedback={hapticFeedback}
      aria-label={`${title}: ${selected?.label ?? 'Choose'}`} aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}><span>{selected?.label ?? 'Choose'}</span><ChevronDown aria-hidden /></Pressable>
    <PremiumPicker isOpen={open && !disabled} title={title} value={value} options={options} onChange={onChange} onClose={() => setOpen(false)} searchable={searchable} description={description} hapticFeedback={hapticFeedback} />
  </>
}
