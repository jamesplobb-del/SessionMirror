import { LockKeyhole, Trophy } from 'lucide-react'
import { getBalanceCharacter } from './balanceCharacters'
import { BALANCE_TROPHIES } from './balanceTrophies'
import type { BalanceStoredDataV2 } from './balanceTypes'

export default function BalanceTrophyCase({
  trophies,
}: {
  trophies: BalanceStoredDataV2['trophies']
}) {
  return (
    <div className="balance-trophy-case">
      {BALANCE_TROPHIES.map((trophy) => {
        const earned = Boolean(trophies[trophy.id])
        const reward = trophy.characterReward
          ? getBalanceCharacter(trophy.characterReward).name
          : null
        return (
          <article key={trophy.id} className={`balance-trophy ${earned ? 'is-earned' : ''}`}>
            <span className="balance-trophy__medal" aria-hidden>
              {earned ? <Trophy /> : <LockKeyhole />}
            </span>
            <span>
              <strong>{trophy.title}</strong>
              <small>{trophy.description}</small>
              {reward && <em>{earned ? `${reward} unlocked` : `Unlocks ${reward}`}</em>}
            </span>
          </article>
        )
      })}
    </div>
  )
}
