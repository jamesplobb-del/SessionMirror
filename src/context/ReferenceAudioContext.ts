import { createContext, useContext } from 'react'
import type { ReferenceAudioRef } from '../utils/practiceRoutines'

export interface ReferenceAudioApi {
  /**
   * Stores a recording from Files in a practice item's library. It does not change
   * what is on the stand; the exercise loads it when it starts.
   */
  importAudio(projectId: string, file: File, duration: number): Promise<ReferenceAudioRef>
  /** True while the stored file is still in that practice item's library. */
  hasAudio(projectId: string, itemId: string): Promise<boolean>
}

/** Provided by the app shell; absent where recordings cannot be stored. */
export const ReferenceAudioContext = createContext<ReferenceAudioApi | null>(null)
export const useReferenceAudio = () => useContext(ReferenceAudioContext)
