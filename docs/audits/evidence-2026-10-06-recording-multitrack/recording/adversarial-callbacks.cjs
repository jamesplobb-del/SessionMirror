const fs=require('node:fs');const ts=require('/Users/jameslobb/Documents/BestTake/node_modules/typescript');const assert=require('node:assert/strict');
const root='/Users/jameslobb/Documents/BestTake';const ref=current=>({current});
function callback(file,name,env){let source=ts.createSourceFile(file,fs.readFileSync(root+'/'+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),expr;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)===name&&n.initializer&&ts.isCallExpression(n.initializer))expr=n.initializer.arguments[0].getText(source);ts.forEachChild(n,visit)}visit(source);assert.ok(expr,name);const js=ts.transpileModule('const fn='+expr,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(env),js+';return fn')(...Object.values(env))}
let clicks=0,prevents=0;let hook=fs.readFileSync(root+'/src/hooks/useLongPress.ts','utf8').replace(/^import[\s\S]*?from '..\/utils\/haptics'\s*/,'').replace(/^export /gm,'');
const js=ts.transpileModule(hook,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const useLongPress=new Function('useRef','useCallback','useEffect',js+'; return useLongPress')(ref,x=>x,()=>{});
global.window={getSelection:()=>null,clearTimeout(){}};
const handlers=useLongPress({onClick(){clicks++},onLongPress(){},hapticFeedback:false});const event={button:0,pointerId:1,preventDefault(){prevents++},stopPropagation(){},currentTarget:{hasPointerCapture(){return false}}};
handlers.onClickCapture({...event,detail:0});assert.equal(clicks,0);handlers.onPointerUp(event);assert.equal(clicks,1);
console.log(JSON.stringify({scenario:'keyboard native click detail0 vs pointer release',keyboardActivations:0,pointerActivations:1,preventedNativeClick:true}));
let reported=0,alerts=0,aborts=0,visible=true;const recorder={state:'recording'};
const env={chunksRef:ref([new Blob(['capture'])]),recordStreamRef:ref({}),streamRef:ref({}),recorderRef:ref(recorder),autoPerformanceStartedAtRef:ref(50),reportError(){reported++},abortActiveWriter:async()=>{aborts++},releaseRecorderStream(){},detachRecorder(r){r.onstop=null;r.ondataavailable=null;r.onerror=null},setIsRecording(v){visible=v},restoreNativeAudioBridgeAfterWebKitCapture:async()=>{},showAlertOutsideTree(){alerts++}};
callback('src/hooks/useCameraSession.ts','bindRecordingHandlers',env)(recorder,'take1');recorder.onerror({error:Error('encoder failure')});
assert.equal(visible,false);assert.equal(env.recorderRef.current,null);assert.equal(reported,1);assert.equal(alerts,0);assert.equal(env.chunksRef.current.length,0);
console.log(JSON.stringify({scenario:'mid-take MediaRecorder encoder failure',visibleRecording:visible,reportedErrors:reported,userAlerts:alerts,discardedChunks:1,recorderDetached:true,aborts}));
