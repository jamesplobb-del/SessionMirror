import type { AutoRecordProfile } from './appSettings'

/** Limit the extra headroom, never the room floor itself. Capping the whole
 * gate below ambient sound can leave a noisy room permanently unable to arm. */
export function handsFreeStartGate(profile: AutoRecordProfile, noiseRms: number): number {
  // Even a very sensitive preset needs space above normal room fluctuations.
  const headroom = Math.max(
    noiseRms * 0.35,
    Math.min(
      noiseRms * (profile.noiseHeadroom - 1) + profile.noiseMargin,
      profile.gate * (profile.gateCapMultiplier - 1),
    ),
  )
  return Math.max(profile.gate, noiseRms + Math.max(profile.noiseMargin, headroom))
}

export function handsFreeQuietBoundary(noiseRms: number, startGate: number): number {
  return noiseRms + (startGate - noiseRms) * 0.5
}

/** Hysteresis stays above the learned room, including its ordinary peaks,
 * while remaining below the energy needed to start a phrase. */
export function handsFreeStopGates(
  profile: AutoRecordProfile, noiseRms: number, noiseLevel: number, startGate: number,
) {
  const rms = Math.max(
    profile.gate * profile.stopGateRatio,
    noiseRms + (startGate - noiseRms) * 0.6,
  )
  return { rms, peak: Math.max(rms, noiseLevel * 1.2 + profile.noiseMargin) }
}
