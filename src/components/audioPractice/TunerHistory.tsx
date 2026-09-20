import { tunerTracePoints, type TunerTrace, type TunerTraceSample } from '../../utils/tunerTrace'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { nearestTunerSample, type TunerHistorySample } from '../../utils/tunerHistory'
import { drawSilkTuner, silkTunerGeometry, SILK_TRACE_WINDOW_MS } from '../../utils/reactiveSilkTuner'
import { getWrittenPitchLabel, type TunerTranspositionId } from '../../utils/tunerTransposition'

/** Match the live trace exactly: same span, same point count, same shape. */
const WINDOW_MS = SILK_TRACE_WINDOW_MS
export default function TunerHistory({ samples, trace, transposition }: { samples: RefObject<TunerHistorySample[]>; trace: RefObject<TunerTrace>; transposition: TunerTranspositionId }) {
  const [snapshot, setSnapshot] = useState<{ readings: TunerHistorySample[]; trace: TunerTraceSample[] } | null>(null)
  const [cursor, setCursor] = useState(0)
  const drag = useRef<{ x: number; time: number; width: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const data = snapshot?.trace ?? []
  const first = data[0]?.time ?? 0, last = data.at(-1)?.time ?? 0
  const selected = nearestTunerSample(snapshot?.readings ?? [], cursor)
  const pitch = selected?.pitch
  const openHistory = () => {
    const list = trace.current.samples.slice()
    if (list.length > 1) { setSnapshot({ readings: samples.current.slice(), trace: list }); setCursor(list.at(-1)!.time) }
  }
  const clamp = (time: number, list = data) => Math.max(list[0]?.time ?? 0, Math.min(list.at(-1)?.time ?? 0, time))
  useEffect(() => {
    if (!snapshot) return
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const width = canvas.clientWidth, height = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pixelWidth = Math.floor(width*dpr), pixelHeight = Math.floor(height*dpr)
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth; canvas.height = pixelHeight
      }
      const ctx = canvas.getContext('2d')
      if (!ctx || !width || !height) return
      ctx.setTransform(dpr,0,0,dpr,0,0)
      ctx.clearRect(0,0,width,height)
      const points = tunerTracePoints(snapshot.trace,cursor,width,height)
      drawSilkTuner(ctx,width,height,points,true,document.documentElement.classList.contains('app-dark-mode'), document.documentElement.id === 'lens-design-system')
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
      <input className="tuner-history__slider" type="range" aria-label="Pitch history position" min={first} max={Math.max(first+1,last)} value={cursor} step="1" onChange={e=>setCursor(Number(e.target.value))}/>
    </>}
    <div className="tuner-history__gesture" role="button" tabIndex={0} aria-label="Browse pitch history"
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!snapshot)openHistory()}}}
      onPointerDown={e=>{
      const list=snapshot?.trace ?? trace.current.samples.slice()
      if(list.length<2)return
      const time=snapshot ? cursor : list.at(-1)!.time
      if (!snapshot) setSnapshot({ readings: samples.current.slice(), trace: list });setCursor(time)
      drag.current={x:e.clientX,time,width:e.currentTarget.clientWidth - silkTunerGeometry(e.currentTarget.clientWidth, 0).headroom}
      e.currentTarget.setPointerCapture(e.pointerId)
    }} onPointerMove={e=>{const d=drag.current;if(d)setCursor(clamp(d.time-(e.clientX-d.x)/d.width*WINDOW_MS))}}
      onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} />
  </div>
}
