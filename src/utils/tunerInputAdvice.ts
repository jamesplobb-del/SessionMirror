export type TunerInputAdvice = 'quiet' | 'loud' | 'unpitched' | null
export function tunerInputAdvice(rmsDb: number, gateDb: number, frequency: number, clarity: number, clarityMin = 0.7): TunerInputAdvice {
  if (!Number.isFinite(rmsDb)) return null
  if (rmsDb >= gateDb + 3 && (!(frequency > 0) || clarity < clarityMin)) return 'unpitched'
  if (rmsDb > -9) return 'loud'
  if (frequency > 0 && clarity >= 0.7 && rmsDb < gateDb + 3) return 'quiet'
  return null
}
