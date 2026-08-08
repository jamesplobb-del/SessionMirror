export type MetronomeSubdivision =
  | 'off'
  | '8ths'
  | 'triplets'
  | '16ths'
  | 'dotted'
  | 'quints'
  | 'septuplets'

/**
 * Click prominence, loudest first.
 *
 * `beat` exists so an unaccented MAIN beat is still audibly a beat. Without it
 * weak beats shared the `subdivision` click, which made beats 2 and 4 of 4/4
 * acoustically identical to the offbeats once subdivisions were switched on —
 * you could no longer tell where the beat was.
 */
export type MetronomeClickTier = 'downbeat' | 'macro' | 'beat' | 'subdivision'
