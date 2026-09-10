import { PITCH_SILENCE_FLOOR_CENTS } from '../../utils/pitchConfig'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { nearestTunerSample, type TunerHistorySample } from '../../utils/tunerHistory'
import { drawSilkTuner, silkTunerGeometry, SILK_TRACE_WINDOW_MS } from '../../utils/reactiveSilkTuner'
import { getWrittenPitchLabel, type TunerTranspositionId } from '../../utils/tunerTransposition'

/** Match the live trace exactly: same span, same point count, same shape. */
const WINDOW_MS = SILK_TRACE_WINDOW_MS
const TRACE_POINTS = 110
/** History is stored ~every 50ms; past this a reading is a real gap, not a held note. */
const STALE_SAMPLE_MS = 140
export default function TunerHistory({ samples, transposition }: { samples: RefObject<TunerHistorySample[]>; transposition: TunerTranspositionId }) {
  const [snapshot, setSnapshot] = useState<TunerHistorySample[] | null>(null)
  const [cursor, setCursor] = useState(0)
  const drag = useRef<{ x: number; time: number; width: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const data = snapshot ?? []
  const first = data[0]?.time ?? 0, last = data.at(-1)?.time ?? 0
  const selected = nearestTunerSample(data, cursor)
  const pitch = selected?.pitch
  const openHistory = () => {
    const list = samples.current.slice()
    if (list.length > 1) { setSnapshot(list); setCursor(list.at(-1)!.time) }
  }
  const clamp = (time: number, list = data) => Math.max(list[0]?.time ?? 0, Math.min(list.at(-1)?.time ?? 0, time))
  useEffect(() => {
    if (!snapshot) return
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx || !width || !height) return
      ctx.setTransform(dpr,0,0,dpr,0,0)
      const geometry = silkTunerGeometry(width,height)
      const end = width-geometry.headroom
      /*
       * Resample onto the live trace's own grid.
       *
       * Browsing should feel like sliding the live line backwards, not like
       * opening a different chart. Plotting the stored samples directly gave
       * neither the same time span nor the same density — history is kept at
       * 20/sec against the live 60 — so the same phrase arrived thinner and
       * more angular. Laying it on TRACE_POINTS evenly spaced bins across the
       * same window makes the two renderings line up: identical geometry,
       * identical spacing, identical renderer.
       *
       * A bin with no sample in it reads as the silence floor, exactly as a
       * dropped frame does live, so rests still show as breaks.
       */
      const step = WINDOW_MS / (TRACE_POINTS - 1)
      const points: { x: number; y: number; cents: number }[] = []
      // Sample-and-hold, not nearest-neighbour: bins land ~17ms apart while
      // history is stored around every 50ms, so asking each bin for a sample of
      // its own would leave two thirds of them empty and draw the held note as
      // a dashed line. Each bin takes the most recent reading at or before it,
      // and only calls it silence once that reading is genuinely stale.
      let cursorIndex = 0
      let held: TunerHistorySample | undefined
      for (let bin = 0; bin < TRACE_POINTS; bin += 1) {
        const at = cursor - WINDOW_MS + bin * step
        // snapshot is time-ordered, so this pointer only ever moves forward.
        while (cursorIndex < snapshot.length && snapshot[cursorIndex]!.time <= at) {
          held = snapshot[cursorIndex]!
          cursorIndex += 1
        }
        const fresh = held && at - held.time <= STALE_SAMPLE_MS
        const cents = fresh ? held!.pitch?.cents ?? PITCH_SILENCE_FLOOR_CENTS : PITCH_SILENCE_FLOOR_CENTS
        points.push({ x: end * (bin / (TRACE_POINTS - 1)), y: geometry.centsToY(cents), cents })
      }
      drawSilkTuner(ctx,width,height,points,Boolean(nearestTunerSample(snapshot,cursor)?.pitch),document.documentElement.classList.contains('app-dark-mode'))
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    const themeObserver = new MutationObserver(draw)
    themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class']})
    return () => {observer.disconnect();themeObserver.disconnect()}
  }, [snapshot,cursor])
  return <div className={`tuner-history ${snapshot ? 'is-browsing' : ''}`}>
    {snapshot && <>
      <div className="tuner-history__readout" aria-live="polite">
        <span>Pitch history · {((last-cursor)/1000).toFixed(1)}s back</span>
        <strong>{pitch ? getWrittenPitchLabel(pitch.midi % 12, Math.floor(pitch.midi / 12) - 1, transposition).noteName : 'Silence'}</strong>
        <p>{pitch ? `${pitch.cents > 0 ? '+' : ''}${pitch.cents.toFixed(1)}¢ · ${Math.abs(pitch.cents)<=5 ? 'In tune' : pitch.cents>0 ? 'Sharp' : 'Flat'}` : 'No detected note here'}</p>
        <button onClick={() => {setSnapshot(null);drag.current=null}}>Live ↗</button>
      </div>
      <canvas ref={canvasRef} className="tuner-history__plot" aria-hidden="true" />
      <input className="tuner-history__slider" type="range" aria-label="Pitch history position" min={first} max={Math.max(first+1,last)} value={cursor} step="50" onChange={e=>setCursor(Number(e.target.value))}/>
    </>}
    <div className="tuner-history__gesture" role="button" tabIndex={0} aria-label="Browse pitch history"
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!snapshot)openHistory()}}}
      onPointerDown={e=>{
      const list=snapshot ?? samples.current.slice()
      if(list.length<2)return
      const time=snapshot ? cursor : list.at(-1)!.time
      setSnapshot(list);setCursor(time)
      drag.current={x:e.clientX,time,width:e.currentTarget.clientWidth}
      e.currentTarget.setPointerCapture(e.pointerId)
    }} onPointerMove={e=>{const d=drag.current;if(d)setCursor(clamp(d.time-(e.clientX-d.x)/d.width*WINDOW_MS))}}
      onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} />
  </div>
}
