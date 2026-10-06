import { build } from '/Users/jameslobb/Documents/BestTake/node_modules/esbuild/lib/main.js'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const dir='/private/tmp/besttake-oct6-audit'
const fakeReact=`
const slots=[]; let cursor=0; let queued=[];
export function begin(){cursor=0;} export function resetHooks(){slots.length=0;cursor=0;queued=[];}
export function effects(){const q=queued;queued=[];for(const f of q)f();}
export function useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );}
export function useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];}
export function useReducer(reducer,initial,init){const i=cursor++;if(!(i in slots))slots[i]=init?init(initial):initial;return [slots[i],action=>{slots[i]=reducer(slots[i],action)}];}
function memo(f,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j]))slots[i]={value:f(),deps};return slots[i].value;}
export function useMemo(f,d){return memo(f,d)}
export function useCallback(f,d){return memo(()=>f,d)}
export function useEffect(f,deps){const i=cursor++;const old=slots[i];if(!old||deps.some((d,j)=>d!==old.deps[j])){queued.push(()=>{old?.cleanup?.();const cleanup=f();slots[i]={deps,cleanup};});}}
`
await build({stdin:{contents:`export * from './src/labs/balance/useBalanceGame';export * from './src/labs/balance/balanceEngine';export * from './src/labs/balance/balanceStorage';export * from './src/labs/balance/balanceMusic';export { useLearnInstrumentGame } from './src/labs/learnInstrument/useLearnInstrumentGame';export { begin,effects,resetHooks } from 'react';`,resolveDir:'/Users/jameslobb/Documents/BestTake'},loader:{'.svg':'dataurl'},bundle:true,platform:'node',format:'esm',outfile:dir+'/games-bundle.mjs',plugins:[{name:'audit-mocks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'audit'}));b.onLoad({filter:/.*/,namespace:'audit'},()=>({contents:fakeReact,loader:'js'}));b.onLoad({filter:/useBalanceGame.ts$/},async a=>({contents:await readFile(a.path,'utf8')+'\nexport { createRoutineResult };',loader:'ts'}));b.onLoad({filter:/balanceAudio.ts$/},()=>({contents:`export async function startBalanceTone(){return {stop(){}}} export async function startBalanceCountIn(){return {done:Promise.resolve(),stop(){}}}`,loader:'ts'}));b.onLoad({filter:/haptics.ts$/},()=>({contents:'export function triggerSuccessHaptic(){}',loader:'ts'}));b.onLoad({filter:/dailyChallengePlan.ts$/},()=>({contents:'export function recordPlannedGame(){}',loader:'ts'}));b.onLoad({filter:/gameTestInput.ts$/},()=>({contents:'export function isGameTestInputOn(){return true}',loader:'ts'}));}}]})
const storage=new Map;globalThis.window={localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},setInterval:()=>1,clearInterval(){},setTimeout:()=>2,clearTimeout(){},addEventListener(){},removeEventListener(){}};globalThis.document={addEventListener(){},removeEventListener(){}};
const m=await import(dir+'/games-bundle.mjs');
let g;function render(){m.begin();g=m.useBalanceGame({initialInstrumentId:'trumpet',hapticFeedback:false});m.effects();}
render();g.updateSettings({single:{writtenMidi:60,repetitions:1},goalSeconds:3,soundRest:{...g.state.settings.soundRest,referencePitch:false,countIn:false}});render();g.start();render();
let now=Date.now();function frame(dt){now+=dt;g.handleAcceptedPitchFrame({timestamp:now,readout:{midi:g.currentTarget.concertMidi,cents:0,frequencyHz:261.625565},confidence:1});render()}
frame(1);frame(260);for(let i=0;i<10;i++)frame(100);assert.equal(g.hud.balancedMs,0);assert.equal(g.visualRef.current.balancedMs,1000);
g.pause();render();assert.equal(g.state.phase,'paused');g.resume();render();render();frame(1);frame(260);frame(100);assert.equal(g.visualRef.current.balancedMs,100);console.log('CONFIRMED: actual Balance hook resets scored hold 1000ms -> 100ms after pause/resume/relock (mock hooks, mic frames and silent audio).');
for(let i=0;i<29;i++)frame(100);assert.equal(g.state.phase,'goalReached');assert.equal(g.state.noteResults.length,1);g.pause();render();g.resume();render();render();frame(1);frame(260);for(let i=0;i<30;i++)frame(100);assert.equal(g.state.noteResults.length,2);
let done=m.balanceReducer(g.state,{type:'NEXT_NOTE'});let result=m.createRoutineResult(done,[],'daily');assert.equal(result.completed,false);assert.equal(result.notesCompleted,2);console.log('CONFIRMED: actual hook goalReached -> pause/resume -> repeated hold yields 2 results for 1 target; actual createRoutineResult returns completed=false.');
const initial=m.createBalanceState(g.state.settings,0);let rest=m.balanceReducer({...initial,phase:'resting',restEndsAt:now+5000},{type:'PAUSE'});rest=m.balanceReducer(rest,{type:'RESUME'});assert.equal(rest.restEndsAt,now+5000);console.log('SOURCE REDUCER: resting pause/resume retains absolute deadline (does not freeze remaining rest).');
m.resetHooks();let timers=[];window.setTimeout=f=>{timers.push(f);return timers.length};window.clearTimeout=()=>{timers=[]};let lesson;
function learnRender(){m.begin();lesson=m.useLearnInstrumentGame({initialInstrumentId:'bb-trumpet',hapticFeedback:false});m.effects();}
learnRender();lesson.selectInstrument('bb-trumpet');learnRender();lesson.start();learnRender();
function learnFrame(offset,dt){now+=dt;const midi=lesson.currentTarget.concertMidi+offset;lesson.handleAcceptedPitchFrame({timestamp:now,readout:{midi,cents:0,noteName:'test',frequencyHz:440*2**((midi-69)/12)},confidence:1});learnRender();}
learnFrame(12,1);assert.equal(lesson.state.detectedStatus,'wrong');learnFrame(0,100);learnFrame(0,160);assert.equal(lesson.state.holdProgress,0);for(let i=0;i<3;i++)learnFrame(0,100);assert.equal(lesson.state.detectedStatus,'correct');
const targetCount=lesson.totalTargetCount;while(lesson.state.phase==='playing'){let callbacks=timers;timers=[];for(const f of callbacks)f();learnRender();if(lesson.state.phase==='playing'){for(let i=0;i<4;i++)learnFrame(0,100);}}
assert.equal(lesson.state.phase,'complete');assert.equal(lesson.completedTargetCount,targetCount);assert.equal(lesson.isCurrentLessonComplete,true);lesson.restart();learnRender();assert.equal(lesson.completedTargetCount,0);assert.equal(lesson.isCurrentLessonComplete,true);
console.log(`PASS: actual Learn hook, transposed trumpet wrong octave rejected, >140ms gap resets hold, ${targetCount} notes complete with persistent course credit; restart clears current run only.`);

