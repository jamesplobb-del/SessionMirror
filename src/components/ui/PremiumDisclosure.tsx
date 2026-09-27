import { Children, cloneElement, isValidElement, useEffect, useId, useRef, useState, type ComponentProps, type HTMLAttributes } from 'react'
import { useReducedMotion } from 'framer-motion'
import { premiumMotion } from '../../utils/premiumMotion'
import { PremiumMotionDiv } from './PremiumMotionSurface'
import '../../styles/premium-controls.css'

/** Preserve native summary keyboard semantics and mounted form state while
 * the content expands. A closing section becomes inert immediately. */
export default function PremiumDisclosure({ children, className = '', open, ...props }: ComponentProps<'details'>) {
  const [expanded, setExpanded] = useState(Boolean(open))
  const [retained, setRetained] = useState(Boolean(open))
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  const reduced = useReducedMotion()
  const contentId = useId()
  useEffect(() => { if (open !== undefined) setExpanded(open) }, [open])
  useEffect(() => { if (expanded) setRetained(true) }, [expanded])
  const nodes = Children.toArray(children)
  const summary = nodes.find(node => isValidElement(node) && node.type === 'summary')
  return <details {...props} className={`premium-disclosure ${className}`.trim()} open={expanded || retained} data-expanded={expanded}>
    {isValidElement<HTMLAttributes<HTMLElement>>(summary) && cloneElement(summary, {
      'aria-expanded': expanded,
      'aria-controls': contentId,
      onClick: event => { event.preventDefault(); summary.props.onClick?.(event); setExpanded(value => !value) },
    })}
    <PremiumMotionDiv id={contentId} className="premium-disclosure-reveal" inert={!expanded} aria-hidden={!expanded}
      initial={false} animate={{ height: expanded ? 'auto' : 0, opacity: expanded ? 1 : 0 }}
      transition={reduced ? { duration: 0 } : premiumMotion({ duration: 0 }, 'popover')}
      onAnimationComplete={() => setRetained(expandedRef.current)}>
      <div className="premium-disclosure-content">{nodes.filter(node => node !== summary)}</div>
    </PremiumMotionDiv>
  </details>
}
