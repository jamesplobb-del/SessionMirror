// Exercise production callback/effect bodies with their actual shared animation helper.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
const reference = await readFile('src/components/ReferenceWidget.tsx', 'utf8')
const routine = await readFile('src/components/RoutineBar.tsx', 'utf8')
const refEffect = reference.match(/  useLayoutEffect\(\(\) => \{\n    const source = pendingFold.current\n([\s\S]*?)\n  }, \[expanded, visible, dockHost, boundaryRef, reducedMotion\]\)/)?.[1]
const refCollapse = reference.match(/  const collapse = \(\) => \{([\s\S]*?)\n  }\n  useEffect/)?.[1]
const routineEffect = routine.match(/  useLayoutEffect\(\(\) => \{\n    const requested = userFoldArrival.current\n([\s\S]*?)\n  }, \[folded, dockHost, reducedMotion, step.id\]\)/)?.[1]
const routineFold = routine.match(/  const fold = \(silent = false\) => \{([\s\S]*?)\n  }\n\n  \/\*\* Back/)?.[1]
assert.ok(refEffect && refCollapse && routineEffect && routineFold, 'Locate complete production callback/effect bodies')
const contents = `import {animateWidgetDockArrival,MUSIC_DOCK_ARRIVAL_EVENT,type MusicDockArrivalDetail} from './src/utils/widgetDockMotion';import {focusWidgetLauncher} from './src/utils/widgetFocus';
export function referencePort(env) {
const {pendingFold,panelRef,expanded,visible,dockHost,node,reducedMotion,dockChip,collapseRequested,onExpandedChange}=env;
return {collapse:()=>{${refCollapse}},effect:()=>{const source=pendingFold.current;${refEffect}}};
}
export function routinePort(env) {
const {userFoldArrival,nodeRef,folded,dockHost,reducedMotion,hapticFeedback,barHeightRef,x,y,insetsRef,restRef,setOpen,setFolded,saveFolded,saveWidgetPosition,triggerLightHaptic,clampToViewport}=env;
const BALL_POSITION_ID='routine-bar-ball',EDGE=12,BALL_SIZE=56;
return {fold:(silent=false)=>{${routineFold}},effect:()=>{const requested=userFoldArrival.current;${routineEffect}}};
}`
const compiled = await build({stdin:{contents,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'})
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const rect = (left,top,width,height)=>({left,top,width,height})
let events=[], animations=[]
globalThis.window={innerWidth:1000,dispatchEvent:e=>events.push(e)}
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail}}
globalThis.getComputedStyle=()=>({transform:'none',opacity:'1'})
const parent={clientWidth:1000,clientHeight:800,getBoundingClientRect:()=>rect(0,0,1000,800)}
const animate = (frames,options)=>{const a={frames,options,cancelled:false,onfinish:null,cancel(){this.cancelled=true}};animations.push(a);return a}
const panel={dataset:{},offsetParent:parent,getBoundingClientRect:()=>rect(100,100,280,240),animate}
let handleFocus=0
const handle={focus:()=>handleFocus++,getBoundingClientRect:()=>rect(930,400,40,80),getClientRects:()=>[1]}
const closedDock={closest:()=>({querySelector:()=>handle})}
const chip={closest:()=>closedDock}
let expandedChanges=[]
const refEnv={pendingFold:{current:null},panelRef:{current:panel},expanded:true,visible:true,dockHost:{},node:{current:null},reducedMotion:false,dockChip:{current:chip},collapseRequested:{current:false},onExpandedChange:v=>expandedChanges.push(v)}
api.referencePort(refEnv).collapse()
assert.deepEqual(expandedChanges,[false]);assert.equal(refEnv.collapseRequested.current,true)
assert.deepEqual(refEnv.pendingFold.current.rect,panel.getBoundingClientRect(),'References captures the mounted owner before collapse')
refEnv.expanded=false
let cleanup=api.referencePort(refEnv).effect()
assert.equal(panel.dataset.widgetFolding,'true');assert.equal(events.length,0)
assert.match(animations.at(-1).frames.at(-1).transform,/translate\(710px, 220px\)/,'References travels to actual closed handle')
cleanup();assert.equal(animations.at(-1).cancelled,true);assert.equal(panel.dataset.widgetFolding,undefined);assert.equal(events.length,0,'Cancel/reopen cannot emit an arrival')
api.referencePort({...refEnv,expanded:true}).collapse()
cleanup=api.referencePort(refEnv).effect();animations.at(-1).onfinish()
assert.deepEqual(events.at(-1).detail,{id:'references'})
api.referencePort({...refEnv,expanded:true}).collapse();refEnv.reducedMotion=true
const beforeReduced=animations.length
api.referencePort(refEnv).effect();assert.equal(animations.length,beforeReduced,'Reduced References fold skips travel')
api.referencePort({...refEnv,expanded:true}).collapse();refEnv.visible=false
const beforeHiddenEvents=events.length
assert.equal(api.referencePort(refEnv).effect(),undefined);assert.equal(events.length,beforeHiddenEvents,'Hidden References does not announce a user arrival')
const ball={offsetWidth:300,offsetHeight:100,animate,closest:()=>closedDock}
const stateChanges=[]
const routineEnv={userFoldArrival:{current:false},nodeRef:{current:ball},folded:true,dockHost:{},reducedMotion:false,hapticFeedback:false,barHeightRef:{current:0},x:{get:()=>100},y:{get:()=>100},insetsRef:{current:{}},restRef:{current:null},setOpen:v=>stateChanges.push(['open',v]),setFolded:v=>stateChanges.push(['folded',v]),saveFolded(){},saveWidgetPosition(){},triggerLightHaptic(){},clampToViewport:(x,y)=>({x,y})}
const beforeInitial=animations.length
assert.equal(api.routinePort(routineEnv).effect(),undefined);assert.equal(animations.length,beforeInitial,'Initial folded state does not schedule a collapse arrival')
api.routinePort(routineEnv).fold(true)
assert.equal(routineEnv.userFoldArrival.current,false,'Automatic preferBall fold stays silent')
assert.equal(api.routinePort(routineEnv).effect(),undefined)
api.routinePort(routineEnv).fold()
assert.equal(routineEnv.userFoldArrival.current,true);assert.deepEqual(stateChanges.at(-1),['folded',true])
cleanup=api.routinePort(routineEnv).effect()
assert.equal(handleFocus,1,'Explicit routine collapse returns focus to the visible closed rail handle')
const routineAnimation=animations.at(-1)
assert.equal(routineAnimation.options.duration,240)
const beforeCancel=events.length;cleanup()
assert.equal(routineAnimation.cancelled,true);assert.equal(routineAnimation.onfinish,null);assert.equal(events.length,beforeCancel,'Routine reopen/unmount cancels completion')
api.routinePort(routineEnv).fold();api.routinePort(routineEnv).effect();animations.at(-1).onfinish()
assert.deepEqual(events.at(-1).detail,{id:'routine-bar-ball'})
api.routinePort(routineEnv).fold();routineEnv.reducedMotion=true
const beforeRoutineReduced=animations.length
api.routinePort(routineEnv).effect();assert.equal(animations.length,beforeRoutineReduced,'Reduced routine arrival skips launcher motion')
console.log('PASS: production References collapse capture, mounted-owner travel to closed handle, cancel/completion, hidden/reduced fallbacks; routine initial/silent exclusion, user collapse, real launcher arrival, cancellation/completion, and reduced motion. Callback/effect ports, no live browser.')
