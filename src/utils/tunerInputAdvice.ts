export type TunerInputAdvice = 'quiet' | 'loud' | null
export function tunerInputAdvice(rmsDb: number, gateDb: number, frequency: number, clarity: number): TunerInputAdvice {
  if (!Number.isFinite(rmsDb)) return null
  if (rmsDb > -9) return 'loud'
  if (frequency > 0 && clarity >= 0.7 && rmsDb < gateDb + 3) return 'quiet'
  return null
}
