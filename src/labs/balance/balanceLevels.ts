/**
 * What a tolerance band is called.
 *
 * All that survives of the Sky Trail ladder. The levels themselves are gone —
 * the game's shape is now Quick Play with a daily challenge beside it, and
 * progress is carried by the streak and the trophy case rather than by stars
 * on a map. The labels are unchanged, because they name the band the player
 * picked in Options, not a rung on the removed ladder.
 */
export function balanceDifficultyLabel(toleranceCents: number): string {
  if (toleranceCents >= 14) return 'Easy'
  if (toleranceCents >= 11) return 'Steady'
  if (toleranceCents >= 9) return 'Normal'
  if (toleranceCents >= 6) return 'Sharp'
  return 'Expert'
}
