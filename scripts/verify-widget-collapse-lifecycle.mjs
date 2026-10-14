// Execute the production hook with deterministic React/DOM ports.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
class Hooks {
  slots = []; cursor = 0; effects = []; dirty = false
  useRef(v) { return this.slots[this.cursor++] ??= { current: v } }
  useState(v) {
    const i = this.cursor++
    this.slots[i] ??= { value: typeof v === 'function' ? v() : v }
    return [this.slots[i].value, next => {
      next = typeof next === 'function' ? next(this.slots[i].value) : next
      if (!Object.is(next, this.slots[i].value)) { this.slots[i].value = next; this.dirty = true }
    }]
  }
  effect(fn, deps) {
    const i = this.cursor++, old = this.slots[i]
    if (old && deps.every((v, j) => Object.is(v, old.deps[j]))) return
    this.slots[i] = { deps, cleanup: old?.cleanup }
    this.effects.push(() => { this.slots[i].cleanup?.(); this.slots[i].cleanup = fn() })
  }
  render(props) {
    let result
    do {
      this.dirty = false; this.cursor = 0; this.effects = []; globalThis.h = this
      result = api.useCollapsibleWidget(props)
      const button = result.ball?.props?.children
      if (button?.props?.ref) button.props.ref.current = launcher
      for (const effect of this.effects) effect()
    } while (this.dirty)
    return result
  }
}
const mocks = {
  react: 'const h=()=>globalThis.h;export const useRef=v=>h().useRef(v),useState=v=>h().useState(v),useEffect=(...a)=>h().effect(...a),useLayoutEffect=useEffect;',
  'react/jsx-runtime': 'export const Fragment="fragment",jsx=(type,props)=>({type,props}),jsxs=jsx;',
  'react-dom': 'export const createPortal=(tree)=>tree;',
  'framer-motion': 'export const useIsPresent=()=>true,useReducedMotion=()=>globalThis.reduceMotion,useMotionValue=v=>globalThis.h.useRef({get:()=>v,set:n=>{v=n}}).current,animate=()=>{};',
  '../hooks/usePrefersReducedMotion': 'export const usePrefersReducedMotion=()=>globalThis.reduceMotion;',
  'lucide-react': 'export const ChevronDown="svg";',
  './ui/PremiumMotionSurface': 'export const PremiumMotionButton="button";',
  '../utils/premiumMotion': 'export const premiumMotion=x=>x;',
  '../utils/featureGuidance': 'export const reportFeatureAction=()=>{};',
  '../utils/motionPresets': 'export const iosDragRelease={};',
  '../utils/floatingWidgetLayout': `export {findAvailableWidgetPanelPosition} from '${process.cwd()}/src/utils/floatingWidgetLayout.ts';export const findAvailableWidgetBallPosition=(w,h,p)=>p,loadPersistentWidgetPosition=()=>null,savePersistentWidgetPosition=()=>{},saveWidgetPosition=()=>{},WIDGET_CONTROL_LAYOUT_EVENT="layout";`,
  './useMusicDockItem': 'export const useMusicDockItem=()=>({order:0});',
  '../utils/musicDockClearance': 'export const musicDockClearX=x=>x;',
}
const compiled = await build({ entryPoints: ['src/components/useCollapsibleWidget.tsx'], bundle:true, write:false, platform:'node', format:'esm', jsx:'automatic', plugins:[{name:'ports',setup(b){
  b.onResolve({filter:/.*/}, a => mocks[a.path] ? {path:a.path,namespace:'port'} : a.path.startsWith('/') ? {path:a.path,namespace:'file'} : undefined)
  b.onLoad({filter:/.*/,namespace:'port'}, a=>({contents:mocks[a.path]}))
  b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'js'}))
}}] })
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const rect = (left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height})
let events=[], animations=[], focused=[], closed=false
const handle = {getBoundingClientRect:()=>rect(930,400,40,80),getClientRects:()=>[1]}
const dock = {id:'music-widget-dock',closest:()=>({querySelector:()=>handle})}
const boundary = {clientWidth:1000,clientHeight:800,getBoundingClientRect:()=>rect(0,0,1000,800),querySelector:()=>null}
const launcher = {getBoundingClientRect:()=>rect(930,160,56,56),getClientRects:()=>[1],closest:()=>closed?dock:null,focus:()=>focused.push('launcher')}
const widget = {offsetWidth:300,offsetHeight:220,offsetParent:boundary,dataset:{},getBoundingClientRect:()=>rect(100,100,300,220),contains:()=>false,querySelector:()=>null,animate(frames,options){
  const animation={frames,options,cancelled:false,cancel(){this.cancelled=true},onfinish:null}; animations.push(animation); return animation
}}
globalThis.window={innerWidth:1000,innerHeight:800,addEventListener(){},removeEventListener(){},dispatchEvent:e=>events.push(e)}
let railObstacle=null
globalThis.document={getElementById:()=>dock,querySelector:()=>railObstacle,activeElement:null}
globalThis.getComputedStyle=()=>({transform:'matrix(1,0,0,1,100,100)',opacity:'1'})
globalThis.ResizeObserver=class {observe(){} disconnect(){}}
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail}}
globalThis.reduceMotion=false
const value = v=>({get:()=>v,set:n=>{v=n}})
let consumed=0
const props={boundaryRef:{current:boundary},widgetRef:{current:widget},x:value(100),y:value(100),positionId:'desk-drone',label:'drone',icon:null,dockRight:true,resetKey:'one',expandRequest:true,onExpandRequestConsumed:()=>consumed++}
const hooks=new Hooks()
let fold=hooks.render(props)
assert.equal(fold.collapsed,false,'Initial activation shows full panel directly')
assert.equal(fold.ball,null); assert.equal(consumed,1); assert.equal(widget.inert,false)
fold=hooks.render({...props,resetKey:'two'})
assert.equal(fold.collapsed,false,'Reset cannot invalidate a pending activation even with unchanged true request')
fold=hooks.render({...props,resetKey:'two',expandRequest:false})
fold.collapse(); fold=hooks.render({...props,resetKey:'two',expandRequest:false})
assert.equal(fold.collapsed,true); assert.equal(widget.inert,true); assert.equal(widget.dataset.widgetFolding,'true')
assert.deepEqual(fold.panelAnimation,{opacity:1,scale:1},'Collapse keeps Framer targets stable so its later native animation cannot hide the WAAPI travel')
const first=animations.at(-1); assert.equal(events.length,0)
fold=hooks.render({...props,resetKey:'three',expandRequest:true})
assert.equal(fold.collapsed,false,'Simultaneous reset and reopen honors activation')
assert.equal(first.cancelled,true,'Quick reopen cancels the in-flight fold')
assert.equal(widget.dataset.widgetFolding,undefined); assert.equal(widget.inert,false); assert.equal(events.length,0)
fold=hooks.render({...props,resetKey:'three',expandRequest:false}); closed=true
fold.collapse(); fold=hooks.render({...props,resetKey:'three',expandRequest:false})
const final=animations.at(-1)
assert.match(final.frames.at(-1).transform,/translate\(700px, 230px\)/,'Closed rail targets actual handle center')
final.onfinish()
assert.equal(events.at(-1).type,'besttake:music-widget-dock-arrival'); assert.deepEqual(events.at(-1).detail,{id:'desk-drone'})
assert.equal(widget.dataset.widgetFolding,undefined); assert.equal(widget.inert,true)
fold=hooks.render({...props,resetKey:'three',expandRequest:true})
fold=hooks.render({...props,resetKey:'three',expandRequest:false})
fold.collapse(); fold=hooks.render({...props,resetKey:'three',expandRequest:false})
const preferenceAnimation=animations.at(-1), beforePreferenceEvents=events.length
globalThis.reduceMotion=true
fold=hooks.render({...props,resetKey:'three',expandRequest:false})
assert.equal(preferenceAnimation.cancelled,true,'Runtime preference change cancels an already-folding panel')
assert.equal(preferenceAnimation.onfinish,null); assert.equal(widget.dataset.widgetFolding,undefined)
assert.equal(events.length,beforePreferenceEvents,'Canceled motion cannot send a stale arrival')
fold=hooks.render({...props,resetKey:'three',expandRequest:true})
fold=hooks.render({...props,resetKey:'three',expandRequest:false})
const count=animations.length; fold.collapse(); hooks.render({...props,resetKey:'three',expandRequest:false})
assert.equal(animations.length,count,'Reduced motion folds immediately without spatial animation')
assert.equal(events.length,2)
// Real placement helper must consider rail geometry after collision search,
// rather than clamp x afterwards and push the panel into another live tool.
const railRect=rect(850,0,150,800), touchRect=rect(806,300,44,100)
const touch={getClientRects:()=>[1],getBoundingClientRect:()=>touchRect}
railObstacle={getClientRects:()=>[1],getBoundingClientRect:()=>railRect,querySelector:()=>touch}
const peerProps={...props,positionId:'peer-panel',resetKey:'peer',widgetRef:{current:{...widget,dataset:{}}},x:value(430),y:value(300),expandRequest:true}
new Hooks().render(peerProps)
const candidateProps={...props,positionId:'candidate-panel',resetKey:'candidate',widgetRef:{current:{...widget,dataset:{}}},x:value(690),y:value(300),expandRequest:true}
new Hooks().render(candidateProps)
const panelRect=p=>rect(p.x.get(),p.y.get(),300,220)
const overlap=(a,b)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top
const candidate=panelRect(candidateProps)
assert.equal(overlap(candidate,railRect),false,'Final collision placement cannot cover open rail body')
assert.equal(overlap(candidate,touchRect),false,'Final collision placement cannot cover protruding touch handle')
assert.equal(overlap(candidate,panelRect(peerProps)),false,'Rail clearance preserves avoidance of another mounted panel')
// A closed offscreen rail still reserves its visible handle.
railRect.left=1030;railRect.right=1180
const closedCandidateProps={...candidateProps,positionId:'closed-rail-panel',resetKey:'closed-rail',widgetRef:{current:{...widget,dataset:{}}},x:value(690),y:value(300)}
new Hooks().render(closedCandidateProps)
assert.equal(overlap(panelRect(closedCandidateProps),touchRect),false,'Offscreen folded body retains protection for its visible handle')
console.log('PASS: production hook initial activation, consumed request, reset/reopen priority, inert mounted owner, actual handle destination, completion event, quick reopen cancellation, runtime reduced-motion cancellation, reduced motion, and real final placement clear of rail/handle/other panels. Deterministic ports; browser visual QA still required.')
