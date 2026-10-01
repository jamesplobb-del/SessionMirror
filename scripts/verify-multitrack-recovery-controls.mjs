import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Exercise the real recovery control handlers and media-host effects; hooks,
// decorative components and file picker/decode are explicit test boundaries.
const built = await build({ stdin: { contents: `export {default as SheetMusicPanel} from './src/multitrack/sheetMusic/SheetMusicPanel';
  export {MultitrackBackingMediaHost} from './src/multitrack/backing/MultitrackBackingTrackPanel';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', jsxFactory: 'globalThis.recoveryElement', jsxFragment: 'globalThis.recoveryFragment', define: { 'import.meta.env': '{}' }, plugins: [{ name: 'ui-boundaries', setup(b) {
    for (const filter of [/^react$/, /^lucide-react$/, /\/ui\/Pressable$/, /\/ui\/PremiumDisclosure$/, /SheetPdfPages$/, /sheetMusicUtils$/,
      /youtubeEmbed$/, /playalong\/youtubeBridge$/]) b.onResolve({ filter }, args => ({ path: args.path, namespace: 'ui-double' }))
    b.onLoad({ filter: /.*/, namespace: 'ui-double' }, ({ path }) => {
      let contents
      if (path === 'react') contents = 'export const useRef=v=>({current:v});export const useState=v=>[typeof v==="function"?v():v,()=>{}];export const useCallback=f=>f;export const useMemo=f=>f();export const useEffect=f=>globalThis.recoveryEffects.push(f);'
      else if (path === 'lucide-react') contents = 'export const ChevronLeft=()=>null,ChevronRight=()=>null,FileImage=()=>null,Move=()=>null,SlidersHorizontal=()=>null,Trash2=()=>null,Upload=()=>null,FileAudio=()=>null,Link=()=>null,Pause=()=>null,Play=()=>null,X=()=>null,Youtube=()=>null'
      else if (path.endsWith('sheetMusicUtils')) contents = 'export const sheetMusicAcceptAttribute=()=>"application/pdf,image/*";export const loadSheetMusicFile=async()=>globalThis.recoveryReplacement'
      else if (path.endsWith('youtubeEmbed')) contents = 'export const normalizeYoutubeEmbedUrl=v=>v,parseYoutubeEmbedUrl=v=>v'
      else if (path.endsWith('youtubeBridge')) contents = 'export const registerYoutubeIframe=()=>{},setYoutubeProxyVolumeFromUi=()=>{},wakeYoutubeReference=()=>{}'
      else contents = 'export default function TestBoundary(){return null}'
      return { contents, loader: 'js' }
    })
  } }] })
const m = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
globalThis.recoveryElement = (type, props, ...children) => ({ type, props: { ...props, children } })
globalThis.recoveryFragment = 'fragment'
globalThis.recoveryEffects = []
const healthy = { src: 'blob:healthy', fileName: 'Opening.png', mimeType: 'image/png', x: .5, y: .5, scale: 1 }
const missing = { src: 'multitrack-asset:missing', missing: true, fileName: 'Part.pdf', mimeType: 'application/pdf',
  x: .2, y: .7, scale: 1.4, pageIndex: 3, pageCount: 9, framePosition: 'left' }
const panel = { kind: 'sheet-music', id: 'music', asset: healthy, cues: [
  { id: 'later', startSec: 120, asset: missing }, { id: 'later-page', startSec: 150, asset: { ...missing, pageIndex: 5 } }] }
const assetChanges = [], cueChanges = [], removals = []
const tree = m.SheetMusicPanel({ panel, currentTimeSec: 0, onAssetChange: a => assetChanges.push(a),
  onCueAssetChange: (id, asset) => cueChanges.push({ id, asset }), onRemoveCue: id => removals.push(id) })
function nodes(element) { return !element || typeof element !== 'object' ? [] : [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)] }
const controls = nodes(tree)
assert.ok(controls.some(e => e.props?.['aria-label'] === 'Missing music file to reconnect'), 'future missing cues reachable at opening without seeking')
assert.ok(controls.some(e => e.props?.['aria-label'] === 'Reconnect Part.pdf'))
assert.ok(!controls.some(e => e.props?.src === missing.src), 'retained missing URL never rendered as PDF/image source')
controls.find(e => e.props?.['aria-label'] === 'Remove missing Part.pdf').props.onClick()
assert.deepEqual(removals, ['later'], 'remove targets selected future cue rather than healthy opening')
globalThis.recoveryReplacement = { ...missing, missing: undefined, src: 'blob:replacement', x: .5, y: .5, scale: 1, pageIndex: 0 }
controls.find(e => e.type === 'input').props.onChange({ currentTarget: { files: [{}], value: 'chosen' } })
await new Promise(resolve => setTimeout(resolve, 5))
assert.deepEqual(assetChanges, [], 'reconnect does not replace healthy opening asset')
assert.deepEqual(cueChanges.map(c => [c.id, c.asset.pageIndex, c.asset.x, c.asset.missing]), [['later', 3, .2, undefined], ['later-page', 5, .2, undefined]])
console.log('PASS: future missing cue reconnect/remove is accessible at time zero; reconnect targets all views of selected source and preserves page/placement.')

globalThis.recoveryEffects = []
const events = []
const audio = { src: 'blob:previous', pause: () => events.push('pause'), removeAttribute: name => { events.push(`remove:${name}`); audio.src = '' }, load: () => events.push('load') }
m.MultitrackBackingMediaHost({ backing: { kind: 'audio', src: 'multitrack-asset:missing-backing', missing: true, volume: .37 },
  audioRef: { current: audio }, youtubeIframeRef: { current: null }, onAudioDurationChange: v => events.push(`duration:${v}`) })
for (const effect of recoveryEffects) effect()
assert.equal(audio.src, '')
assert.deepEqual(events.slice(0, 4), ['pause', 'remove:src', 'load', 'duration:0'])
console.log('PASS: missing backing pauses and clears old media source; no retained missing URL enters the audio element.')
