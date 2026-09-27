import { forwardRef } from 'react'
import { useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { premiumMotion } from '../../utils/premiumMotion'
import { PremiumMotionDiv } from './PremiumMotionSurface'

/** Key at the navigation boundary, never at a changing form value. Mounts
 * immediately so actions and media setup do not wait for presentation. */
const PremiumFlowPage = forwardRef<HTMLDivElement, HTMLMotionProps<'div'> & { direction?: number }>(
  function PremiumFlowPage({ direction = 1, className = '', ...props }, ref) {
    const reduced = useReducedMotion()
    return <PremiumMotionDiv
      ref={ref}
      className={`premium-flow-page ${className}`.trim()}
      initial={{ opacity: 0, x: reduced ? 0 : direction * 28, y: reduced ? 0 : 8, scale: reduced ? 1 : .985 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={premiumMotion({ duration: .1 }, 'screen')}
      {...props}
    />
  },
)

export default PremiumFlowPage
