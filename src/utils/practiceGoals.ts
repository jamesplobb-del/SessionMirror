/** Player-chosen cues. None is selected or inferred by the app. */
export const PRACTICE_FOCUSES = [
  'Sound', 'Intonation', 'Timing', 'Musicality', 'Posture', 'Breathing', 'Articulation',
] as const

export type PracticeFocus = typeof PRACTICE_FOCUSES[number]

/** "Timing", "focus on timing" or "work on timing", spoken after a take. */
export function matchSpokenPracticeFocus(transcript: string): PracticeFocus | null {
  const phrase = transcript.toLocaleLowerCase().replace(/[.!?]+$/g, '').trim()
  return PRACTICE_FOCUSES.find((focus) => {
    const word = focus.toLocaleLowerCase()
    return phrase === word || phrase === `focus on ${word}` || phrase === `work on ${word}`
  }) ?? null
}
