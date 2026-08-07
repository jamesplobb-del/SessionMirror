import {
  getPracticeGameCharacter,
  isPracticeGameCharacterId,
  PRACTICE_GAME_CHARACTERS,
  type PracticeGameCharacterId,
} from '../practiceGameCharacters'

export type BalanceCharacterId = 'balancer' | PracticeGameCharacterId

export interface BalanceCharacterOption {
  id: BalanceCharacterId
  name: string
  asset: string | null
  scale: number
}

export const BALANCE_CHARACTERS: readonly BalanceCharacterOption[] = [
  { id: 'balancer', name: 'Balancer', asset: null, scale: 1 },
  ...PRACTICE_GAME_CHARACTERS,
]

export function isBalanceCharacterId(value: unknown): value is BalanceCharacterId {
  return value === 'balancer' || isPracticeGameCharacterId(value)
}

export function getBalanceCharacter(id: BalanceCharacterId): BalanceCharacterOption {
  if (id === 'balancer') return BALANCE_CHARACTERS[0]
  return getPracticeGameCharacter(id)
}
