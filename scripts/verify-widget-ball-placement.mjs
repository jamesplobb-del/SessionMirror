import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/utils/floatingWidgetLayout.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { findAvailableWidgetBallPosition: place } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
for (const [width, height] of [[390,844], [320,568], [844,390], [320,180]]) {
  const occupied = []
  for (let i = 0; i < 4; i++) {
    const p = place(width, height, {x: width-68, y: height-68}, occupied)
    assert.ok(p.x >= 12 && p.x + 56 <= width-12 && p.y >= 12 && p.y+56 <= height-12)
    for (const other of occupied) assert.ok(Math.abs(p.x-other.x) >= 68 || Math.abs(p.y-other.y) >= 68, 'Balls must have a gap even when all saved positions coincide')
    occupied.push(p)
  }
  assert.deepEqual(place(width, height, occupied[0], occupied.slice(1)), occupied[0], 'Keep an available user-selected position')
}
console.log('Widget ball placement: non-overlapping saved, collapsed, and resized positions passed.')
