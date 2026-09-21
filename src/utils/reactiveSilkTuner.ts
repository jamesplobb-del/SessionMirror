import { isSilenceFloorSample, TUNING_GREEN_CENTS, TUNING_YELLOW_CENTS } from './pitchUtils'

/** Blend around zone boundaries so tiny pitch changes cannot flash between colors. */
export function silkPitchColor(cents: number): string {
  const green = [32, 237, 120], yellow = [244, 197, 43], red = [245, 76, 98]
  const distance = Math.abs(cents)
  const boundary = distance < (TUNING_GREEN_CENTS + TUNING_YELLOW_CENTS) / 2
    ? TUNING_GREEN_CENTS : TUNING_YELLOW_CENTS
  const from = boundary === TUNING_GREEN_CENTS ? green : yellow
  const to = boundary === TUNING_GREEN_CENTS ? yellow : red
  const t = Math.max(0, Math.min(1, (distance - boundary + 2) / 4))
  const blend = t * t * (3 - 2 * t)
  return '#' + from.map((value, i) => Math.round(value + (to[i] - value) * blend).toString(16).padStart(2, '0')).join('')
}
/** Approved Flow palette, shared by the pitch line and full-screen tint. */
export function silkFlowColor(cents: number, dark = false): string {
  const green = dark ? [89, 231, 181] : [3, 156, 112]
  const amber = dark ? [255, 210, 115] : [223, 149, 28]
  const red = dark ? [255, 139, 158] : [239, 92, 120]
  const distance = Math.abs(cents)
  const lower = distance < 10
  const from = lower ? green : amber, to = lower ? amber : red
  const t = Math.max(0, Math.min(1, (distance - (lower ? 3 : 12)) / (lower ? 7 : 10)))
  const blend = t * t * (3 - 2 * t)
  return '#' + from.map((value, i) => Math.round(value + (to[i] - value) * blend).toString(16).padStart(2, '0')).join('')
}

export function silkTunerGeometry(width: number, height: number) {
  const center = height * .51, range = height * .19
  const centsToY = (cents: number) => center - Math.max(-40, Math.min(40, cents)) / 30 * range
  const bandBottom = centsToY(-TUNING_GREEN_CENTS)
  return { center, centsToY, bandBottom, targetY: bandBottom + 18, flatY: bandBottom + 52, headroom: Math.min(40, width * .16) }
}

/**
 * Consecutive silence-floor samples a held line is allowed to span.
 *
 * The live trace ticks at 60Hz, so three samples is about 50ms — shorter than
 * any real gap between notes, and far shorter than a breath.
 */
const MAX_BRIDGED_GAP_SAMPLES = 3

/**
 * How much time the live trace shows across the canvas.
 *
 * Live and rewind use timestamps on this fixed scale, independent of frame
 * rate. Kept at the original 110-point / 60Hz duration for familiar spacing.
 */
export const SILK_TRACE_WINDOW_MS = Math.round((110 / 60) * 1000)

type SilkPoint = { x: number; y: number; cents: number; time?: number }
type IndexedSilkPoint = { point: SilkPoint; index: number }

function colorWithAlpha(color: string, alpha: number, contrast = false): string {
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  const strength = contrast ? .7 : 1
  return `rgba(${Math.round(red*strength)},${Math.round(green*strength)},${Math.round(blue*strength)},${Math.max(0, Math.min(1, alpha))})`
}

function silkGradient(
  ctx: CanvasRenderingContext2D,
  run: IndexedSilkPoint[],
  totalPoints: number,
  startAlpha: number,
  endAlpha: number,
  contrast = false,
  flowDark?: boolean,
) {
  const firstX = run[0].point.x
  const lastX = Math.max(firstX + 1, run[run.length - 1].point.x)
  const gradient = ctx.createLinearGradient(firstX, 0, lastX, 0)
  // Use every stored point at its actual x position. A stride tied to the
  // moving window changed which colors were sampled on every frame, making
  // even old sections of the line shimmer as they scrolled.
  for (let runIndex = 0; runIndex < run.length; runIndex += 1) {
    const entry = run[runIndex]
    const age = totalPoints <= 1 ? 1 : entry.index / (totalPoints - 1)
    gradient.addColorStop(
      Math.max(0, Math.min(1, (entry.point.x - firstX) / (lastX - firstX))),
      colorWithAlpha(flowDark == null ? silkPitchColor(entry.point.cents) : silkFlowColor(entry.point.cents, flowDark), startAlpha + (endAlpha - startAlpha) * age, contrast),
    )
  }
  const last = run[run.length - 1]
  const lastAge = totalPoints <= 1 ? 1 : last.index / (totalPoints - 1)
  gradient.addColorStop(1, colorWithAlpha(flowDark == null ? silkPitchColor(last.point.cents) : silkFlowColor(last.point.cents, flowDark), startAlpha + (endAlpha - startAlpha) * lastAge, contrast))
  return gradient
}

function drawSilkRun(ctx: CanvasRenderingContext2D, run: IndexedSilkPoint[], totalPoints: number, air = false, dark = false) {
  if (run.length < 2) return
  if (air) {
    // The approved Clean line: constant width and opacity, centered on the
    // measured trace. Keep timing, pitch values, and real silence gaps intact.
    ctx.strokeStyle = silkGradient(ctx, run, totalPoints, .92, .92, false, dark)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.moveTo(run[0].point.x, run[0].point.y)
    for (let index = 1; index < run.length; index += 1) {
      ctx.lineTo(run[index].point.x, run[index].point.y)
    }
    ctx.stroke()
    return
  }
  if (!air) {
  ctx.fillStyle = silkGradient(ctx, run, totalPoints, .02, .13)
  ctx.beginPath()
  ctx.moveTo(run[0].point.x, run[0].point.y)
  for (let index = 1; index < run.length; index += 1) {
    ctx.lineTo(run[index].point.x, run[index].point.y)
  }
  for (let index = run.length - 1; index >= 0; index -= 1) {
    ctx.lineTo(run[index].point.x, run[index].point.y + 16)
  }
  ctx.closePath()
  ctx.fill()
  }

  ctx.strokeStyle = silkGradient(ctx, run, totalPoints, air ? .65 : .15, 1, air && !dark)
  ctx.lineWidth = air ? 2.8 : 5
  ctx.beginPath()
  ctx.moveTo(run[0].point.x, run[0].point.y)
  for (let index = 1; index < run.length; index += 1) {
    ctx.lineTo(run[index].point.x, run[index].point.y)
  }
  ctx.stroke()
}

/** Paint measured history only. No simulated movement or changes to pitch detection. */
export function drawSilkTuner(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  points: SilkPoint[], active: boolean, dark: boolean, air = false,
): string {
  const g = silkTunerGeometry(width, height)
  ctx.save()
  ctx.fillStyle = air ? '#20ed7817' : '#20ed782e'
  ctx.fillRect(air ? 14 : 10, g.centsToY(5), width - (air ? 28 : 20), g.bandBottom - g.centsToY(5))
  ctx.strokeStyle = '#00d85a59'; ctx.lineWidth = 1
  for (const y of air ? [] : [g.centsToY(5), g.bandBottom]) { ctx.beginPath(); ctx.moveTo(16,y);ctx.lineTo(width-16,y);ctx.stroke() }
  ctx.strokeStyle = dark ? '#adcfcf44' : '#567b8333'
  ctx.beginPath();ctx.moveTo(14,g.center);ctx.lineTo(width-14,g.center);ctx.stroke()
  // No Sharp / Flat / TARGET captions. The green band already says where in
  // tune is, and up/down needs no caption once the trace is moving. Geometry
  // keeps targetY and flatY: they still reserve the space the labels used to
  // occupy, so the trace and its endpoint dot stay clear of the bottom edge.
  if (air) {
    ctx.save(); ctx.beginPath(); ctx.rect(8, 0, Math.max(0,width-8), height); ctx.clip()
  }
  ctx.lineCap='round';ctx.lineJoin='round'
  let run: IndexedSilkPoint[] = []
  let gap = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (isSilenceFloorSample(point.cents)) {
      // Bridge a dropout of a frame or two instead of severing the line.
      //
      // The tracker writes a silence-floor sample on *every* tick that does not
      // accept a pitch, and at 60Hz a breath's worth of background noise, a note
      // attack, or one frame failing the clarity gate is enough to interleave
      // them with good samples. Splitting on each one shredded a held note into
      // fragments, and a fragment shorter than two points draws nothing at all —
      // so the line visibly blinked while the player was doing nothing wrong.
      //
      // Only a gap longer than MAX_BRIDGED_GAP_SAMPLES ends the run, so a real
      // rest still reads as a break. This is a drawing decision only: no sample
      // is invented and nothing measured is changed.
      // Timestamped traces already hold brief dropouts when captured; a
      // stored silence in that path is a real gap and must stay a gap.
      gap += 1
      if (point.time != null || gap > MAX_BRIDGED_GAP_SAMPLES) {
        drawSilkRun(ctx, run, points.length, air, dark)
        run = []
      }
    } else {
      gap = 0
      run.push({ point, index })
    }
  }
  drawSilkRun(ctx, run, points.length, air, dark)
  const last=points.at(-1)
  const color=active&&last&&!isSilenceFloorSample(last.cents)?(air ? silkFlowColor(last.cents, dark) : silkPitchColor(last.cents)):'transparent'
  if(color!=='transparent'&&last) {
    if (!air) {
    const halo=ctx.createRadialGradient(last.x,last.y,0,last.x,last.y,33)
    halo.addColorStop(0,color+'b3');halo.addColorStop(.38,color+'57');halo.addColorStop(1,color+'00')
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(last.x,last.y,33,0,Math.PI*2);ctx.fill()
    }
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(last.x,last.y,air ? 6 : 8,0,Math.PI*2);ctx.fill()
    if (!air) {ctx.strokeStyle='#ffffffd9';ctx.lineWidth=1.7;ctx.stroke()}
    if (!air) {ctx.fillStyle='white';ctx.beginPath();ctx.arc(last.x,last.y,2.4,0,Math.PI*2);ctx.fill()}
  }
  if (air) ctx.restore()
  ctx.restore()
  return color
}
