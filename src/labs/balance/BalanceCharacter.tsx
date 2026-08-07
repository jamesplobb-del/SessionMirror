import { forwardRef } from 'react'

const BalanceCharacter = forwardRef<HTMLDivElement, { active: boolean }>(
  function BalanceCharacter({ active }, ref) {
    return (
      <div
        ref={ref}
        className={`balance-character ${active ? 'balance-character--walking' : ''}`}
        aria-hidden
      >
        <span className="balance-character__rig">
          <span className="balance-character__hair" />
          <span className="balance-character__head" />
          <span className="balance-character__body" />
          <span className="balance-character__hips" />
          <span className="balance-character__arm balance-character__arm--left">
            <i className="balance-character__hand" />
          </span>
          <span className="balance-character__arm balance-character__arm--right">
            <i className="balance-character__hand" />
          </span>
          <span className="balance-character__leg balance-character__leg--left" />
          <span className="balance-character__leg balance-character__leg--right" />
        </span>
      </div>
    )
  },
)

export default BalanceCharacter
