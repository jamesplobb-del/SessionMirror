import { forwardRef, type CSSProperties } from 'react'
import { getBalanceCharacter, type BalanceCharacterId } from './balanceCharacters'

const BalanceCharacter = forwardRef<HTMLDivElement, { active: boolean; characterId: BalanceCharacterId }>(
  function BalanceCharacter({ active, characterId }, ref) {
    const character = getBalanceCharacter(characterId)
    return (
      <div
        ref={ref}
        className={`balance-character ${active ? 'balance-character--walking' : ''}`}
        aria-hidden
      >
        {character.asset ? (
          <span
            className="balance-character__rig balance-character__rig--sprite"
            style={{ '--balance-sprite-scale': character.scale } as CSSProperties}
          >
            <img className="balance-character__sprite" src={character.asset} alt="" draggable={false} />
          </span>
        ) : (
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
        )}
      </div>
    )
  },
)

export default BalanceCharacter
