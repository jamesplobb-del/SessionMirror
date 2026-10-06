import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build } from 'esbuild'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
const out='docs/audits/evidence-2026-10-06-tools-audit'
const compile=async (entry,plugins=[])=>{
 const b=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',jsx:'automatic',packages:'external',plugins})
 const path=`${out}/widgets-probe-${entry.includes('Drawer')?'drawer':'hook'}.bundle.mjs`
 fs.writeFileSync(path,b.outputFiles[0].text)
 return import(`./${path.split('/').at(-1)}?${Date.now()}`)
}
const Drawer=(await compile('src/components/MusicWidgetDrawer.tsx')).default
const closed=renderToStaticMarkup(React.createElement(Drawer,{open:false,onOpenChange(){}}))
const open=renderToStaticMarkup(React.createElement(Drawer,{open:true,onOpenChange(){}}))
assert.match(closed,/music-widget-drawer--closed/)
assert.match(closed,/aria-expanded="false"/)
assert.match(closed,/role="toolbar" aria-label="Music tools"/)
assert.doesNotMatch(closed.match(/<div id="music-widget-dock"[^>]*>/)[0],/inert|aria-hidden/)
assert.doesNotMatch(open.match(/<div id="music-widget-dock"[^>]*>/)[0],/inert|aria-hidden/)
fs.writeFileSync(`${out}/widgets-closed-drawer-markup.html`,closed)
console.log('CONFIRMED actual Drawer SSR: closing changes class and handle aria-expanded, but toolbar has no inert/aria-hidden guard.')
globalThis.window={innerWidth:390,innerHeight:844}
globalThis.localStorage={setItem(){},getItem(){return null}}
const mock={name:'isolated-hook-ports',setup(b){
 b.onResolve({filter:/^(react|react-dom|framer-motion|lucide-react)$/},a=>({path:a.path,namespace:'mock'}))
 b.onResolve({filter:/PremiumMotionSurface|premiumMotion|featureGuidance|motionPresets|useMusicDockItem|widget-ball\.css$/},a=>({path:a.path,namespace:'mock'}))
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:
 a.path==='react'?`export const useState=x=>[typeof x==='function'?x():x,()=>{}];export const useRef=x=>({current:x});export const useEffect=()=>{};export const useLayoutEffect=()=>{};`:
 a.path==='react-dom'?`export const createPortal=x=>x;`:
 a.path==='framer-motion'?`export const useMotionValue=x=>({get:()=>x,set:v=>{x=v}});export const useIsPresent=()=>true;export const useReducedMotion=()=>true;export const animate=()=>{};`:
 a.path==='lucide-react'?`export const ChevronDown=()=>null;`:
 a.path.includes('PremiumMotionSurface')?`export const PremiumMotionButton='button';`:
 a.path.includes('premiumMotion')?`export const premiumMotion=x=>x;`:
 a.path.includes('featureGuidance')?`export const reportFeatureAction=()=>{};`:
 a.path.includes('motionPresets')?`export const iosDragRelease={};`:
 a.path.includes('useMusicDockItem')?`export const useMusicDockItem=()=>({});`:'',loader:'js'}))
}}
const {useCollapsibleWidget}=await compile('src/components/useCollapsibleWidget.tsx',[mock])
const boundary={current:{clientWidth:390,clientHeight:844,getBoundingClientRect:()=>({left:0,top:0})}}
const fold=useCollapsibleWidget({boundaryRef:boundary,widgetRef:{current:null},x:{get:()=>0,set(){}},y:{get:()=>0,set(){}},positionId:'probe',label:'probe',icon:null})
const button=fold.ball.props.children
const {x,y}=button.props.style
x.set(322);y.set(220)
for(let i=0;i<2;i++)button.props.onKeyDown({key:'ArrowDown',preventDefault(){}})
assert.equal(y.get(),244)
console.log('HANDLER ONLY: two ArrowDown calls move ball y220→244 without consulting occupied placements; a y288 peer would geometrically intersect. Not promoted: deliberate keyboard placement and no rendered occlusion evidence.')
