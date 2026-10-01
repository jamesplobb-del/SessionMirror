/** Silent practice stays available when headphones are absent or unverified. */
export function canUseStaffJumperAudio(
  config: { metronome: boolean; drone: boolean },
  headphonesConnected: boolean,
): boolean {
  return headphonesConnected || (!config.metronome && !config.drone)
}
