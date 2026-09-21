import { drawSilkTuner, silkFlowColor } from '../../../src/utils/reactiveSilkTuner'
import { isSilenceFloorSample } from '../../../src/utils/pitchUtils'

type Point = { x: number; y: number; cents: number; time?: number }
export type TraceOption = 'clean' | 'beads' | 'focus'
/** Preview renderers use the real captured trace geometry; no generated curves. */
export function drawTraceOption(ctx: CanvasRenderingContext2D, width: number, height: number, points: Point[], dark: boolean, option: TraceOption) {
  if (option === 'clean') return drawSilkTuner(ctx, width, height, points, true, dark, true)
  drawSilkTuner(ctx, width, height, [], false, dark, true)
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const end = points.at(-1)
  const span = Math.max(1, points.length - 1)
  let run: { point: Point; index: number }[] = []
  const flush = () => {
    if (run.length < 2) { run = []; return }
    const startX = run[0].point.x, endX = Math.max(startX + 1, run.at(-1)!.point.x)
    const gradient = ctx.createLinearGradient(startX, 0, endX, 0)
    for (const { point, index } of run) {
      const age = index / span
      const alpha = option === 'focus' ? .24 + .76 * age * age : .92
      gradient.addColorStop(Math.max(0, Math.min(1, (point.x - startX) / (endX - startX))), silkFlowColor(point.cents, dark) + Math.round(alpha * 255).toString(16).padStart(2, '0'))
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = gradient
    ctx.lineWidth = option === 'beads' ? 2.5 : 5
    ctx.beginPath(); ctx.moveTo(run[0].point.x, run[0].point.y)
    for (const { point } of run.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.stroke(); run = []
  }
  points.forEach((point, index) => {
    if (isSilenceFloorSample(point.cents)) flush()
    else run.push({ point, index })
  })
  flush()
  if (option === 'beads') {
    let lastX = -Infinity
    for (const p of points) {
      if (isSilenceFloorSample(p.cents) || p.x < 10 || p.x - lastX < 18) continue
      lastX = p.x; ctx.globalAlpha = 1; ctx.fillStyle = silkFlowColor(p.cents, dark)
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill()
    }
  }
  const color = end && !isSilenceFloorSample(end.cents) ? silkFlowColor(end.cents, dark) : 'transparent'
  if (end && color !== 'transparent') {
    ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.strokeStyle = color
    if (option === 'focus') {
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(end.x, end.y, 11, 0, Math.PI * 2); ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(end.x, end.y, option === 'focus' ? 5 : 6, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
  return color
}
