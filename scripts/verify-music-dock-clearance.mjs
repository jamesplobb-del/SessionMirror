// Run with: node scripts/verify-music-dock-clearance.mjs
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built = await build({
  stdin: { contents: `export { musicDockClearX } from './src/utils/musicDockClearance'; export { settleClearOfMusicRail } from './src/utils/floatingWidgetLayout';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm',
})
const { musicDockClearX, settleClearOfMusicRail } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
let drawerLeft = 762, handleLeft = 718, drawerVisible = true, handleVisible = true, hasDrawer = true, hasHandle = true
const handle = {
  getClientRects: () => handleVisible ? [1] : [],
  getBoundingClientRect: () => ({ left: handleLeft }),
}
const drawer = {
  getClientRects: () => drawerVisible ? [1] : [],
  getBoundingClientRect: () => ({ left: drawerLeft }),
  querySelector: selector => {
    assert.equal(selector, '.music-widget-drawer__handle')
    return hasHandle ? handle : null
  },
}
globalThis.document = { querySelector: selector => {
  assert.equal(selector, '.app-shell--music-page .music-widget-drawer')
  return hasDrawer ? drawer : null
} }
const width = 287
const restored = musicDockClearX(463, width)
assert.equal(restored, 419, 'native iPad restore reserves the handle touch area rather than just the rail body')
assert.equal(restored + width + 12, handleLeft, 'the full panel leaves a 12px gap before the handle')
assert.equal(musicDockClearX(210, width), 210, 'a panel already clear of the handle keeps its chosen location')
assert.equal(musicDockClearX(443, width, 20), 399, 'viewport handle coordinates convert to the caller boundary origin')
const x = { value: 463, get() { return this.value }, set(value) { this.value = value } }
settleClearOfMusicRail(x, { offsetWidth: width }, { getBoundingClientRect: () => ({ left: 0 }) })
assert.equal(x.value, restored, 'drag release uses the same handle clearance as restoration')
// With the rail folded, its handle still occupies the last 44px of the score.
drawerLeft = 834; handleLeft = 790
assert.equal(musicDockClearX(535, width), 491, 'the folded rail keeps its visible Show tools handle accessible')
handleVisible = false
assert.equal(musicDockClearX(535, width), 535, 'a hidden handle does not reserve its stale rectangle')
hasHandle = false; drawerLeft = 762
assert.equal(musicDockClearX(535, width), 463, 'an absent handle falls back to the visible rail body')
drawerVisible = false
assert.equal(musicDockClearX(535, width), 535, 'phone-hidden drawers do not move panels toward a zero rectangle')
hasDrawer = false
assert.equal(musicDockClearX(535, width), 535, 'non-Music surfaces keep their positions')
delete globalThis.document
assert.equal(musicDockClearX(535, width), 535, 'server-side reads are a no-op')
console.log('PASS: iPad restored/dragged panel clearance protects open and folded rail handles, boundary offsets, hidden handles, phone drawers, and non-Music surfaces.')
