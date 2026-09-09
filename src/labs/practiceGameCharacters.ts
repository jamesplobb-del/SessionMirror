import { characterUnlocked } from '../utils/dailyChallenges'
import astronautAsset from '../assets/practice-characters/ensemble/luna.svg'
import birdAsset from '../assets/practice-characters/ensemble/pip.svg'
import catAsset from '../assets/practice-characters/ensemble/cleo.svg'
import foxAsset from '../assets/practice-characters/ensemble/reed.svg'
import robotAsset from '../assets/practice-characters/ensemble/riff.svg'
import trumpeterAsset from '../assets/practice-characters/ensemble/otto.svg'

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
  instrument: string
  personality: string
  asset: string
  /** Per-asset optical-size adjustment shared by game renderers. */
  scale: number
}

/** Storage IDs stay stable across the new artwork so saved players and trophies survive. */
export const PRACTICE_GAME_CHARACTERS: readonly PracticeGameCharacter[] = [
  { id: 'trumpeter', name: 'Otto', instrument: 'Trumpet otter', personality: 'First to warm up. Last to lose heart.', asset: trumpeterAsset, scale: 1.18 },
  { id: 'cat', name: 'Cleo', instrument: 'Violin cat', personality: 'Finds the sweet spot with eyes closed.', asset: catAsset, scale: 1.18 },
  { id: 'robot', name: 'Riff', instrument: 'Drummer raccoon', personality: 'Makes a groove out of just about anything.', asset: robotAsset, scale: 1.18 },
  { id: 'bird', name: 'Pip', instrument: 'Flute bird', personality: 'Small wings. Big breath. One more phrase.', asset: birdAsset, scale: 1.18 },
  { id: 'fox', name: 'Reed', instrument: 'Saxophone fox', personality: 'Turns a wrong note into a new idea.', asset: foxAsset, scale: 1.18 },
  { id: 'astronaut', name: 'Luna', instrument: 'Conductor owl', personality: 'Always has room for one more player.', asset: astronautAsset, scale: 1.18 },
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
  if (typeof window === 'undefined' || !characterUnlocked(id)) return
  try {
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, id)
  } catch {
    // React state still preserves the current session selection.
  }
}
