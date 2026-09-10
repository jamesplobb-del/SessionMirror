import { PITCH_SILENCE_FLOOR_CENTS } from '../../utils/pitchConfig'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { nearestTunerSample, type TunerHistorySample } from '../../utils/tunerHistory'
import { drawSilkTuner, silkTunerGeometry } from '../../utils/reactiveSilkTuner'
import { getWrittenPitchLabel, type TunerTranspositionId } from '../../utils/tunerTransposition'

const WINDOW_MS = 8000
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
      const points = snapshot.filter(s => s.time >= cursor-WINDOW_MS && s.time <= cursor).map(s => ({
        x: end+(s.time-cursor)/WINDOW_MS*end,
        y: geometry.centsToY(s.pitch?.cents ?? 0),
        cents: s.pitch?.cents ?? PITCH_SILENCE_FLOOR_CENTS,
      }))
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
