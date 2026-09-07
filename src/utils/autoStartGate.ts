/** Pure sustained-energy decision shared by native and WebKit monitor frames. */
export function advanceAutoStart(since: number | null, now: number, rms: number, gate: number, holdMs: number) {
  if (!Number.isFinite(rms) || !Number.isFinite(gate) || gate <= 0 || rms < gate) return { since: null, start: false }
  const next = since ?? now
  return { since: next, start: now - next >= holdMs }
}
