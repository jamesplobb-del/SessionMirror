import astronautAsset from '../assets/practice-characters/astronaut.webp'
import birdAsset from '../assets/practice-characters/bird.webp'
import catAsset from '../assets/practice-characters/cat.webp'
import foxAsset from '../assets/practice-characters/fox.webp'
import robotAsset from '../assets/practice-characters/robot.webp'
import trumpeterAsset from '../assets/practice-characters/trumpeter.webp'

export type PracticeGameCharacterId =
  | 'trumpeter'
  | 'cat'
  | 'robot'
  | 'bird'
  | 'fox'
  | 'astronaut'

export interface PracticeGameCharacter {
  id: PracticeGameCharacterId
  name: string
  asset: string
  /** Per-asset optical-size adjustment shared by game renderers. */
  scale: number
}

export const PRACTICE_GAME_CHARACTERS: readonly PracticeGameCharacter[] = [
  { id: 'trumpeter', name: 'Trumpeter', asset: trumpeterAsset, scale: 1.04 },
  { id: 'cat', name: 'Cat', asset: catAsset, scale: 1.05 },
  { id: 'robot', name: 'Robot', asset: robotAsset, scale: 1.04 },
  { id: 'bird', name: 'Bird', asset: birdAsset, scale: 1.06 },
  { id: 'fox', name: 'Fox', asset: foxAsset, scale: 1.04 },
  { id: 'astronaut', name: 'Astronaut', asset: astronautAsset, scale: 1.03 },
] as const

const CHARACTER_STORAGE_KEY = 'besttake.practiceGames.character'

export function isPracticeGameCharacterId(value: unknown): value is PracticeGameCharacterId {
  return PRACTICE_GAME_CHARACTERS.some((character) => character.id === value)
}

export function getPracticeGameCharacter(id: PracticeGameCharacterId): PracticeGameCharacter {
  return PRACTICE_GAME_CHARACTERS.find((character) => character.id === id) ?? PRACTICE_GAME_CHARACTERS[0]
}

export function loadPracticeGameCharacter(): PracticeGameCharacterId {
  if (typeof window === 'undefined') return 'trumpeter'
  try {
    const value = window.localStorage.getItem(CHARACTER_STORAGE_KEY)
    return isPracticeGameCharacterId(value) ? value : 'trumpeter'
  } catch {
    return 'trumpeter'
  }
}

export function savePracticeGameCharacter(id: PracticeGameCharacterId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, id)
  } catch {
    // React state still preserves the current session selection.
  }
}
