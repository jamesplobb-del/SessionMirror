import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/utils/floatingWidgetLayout.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { findAvailableWidgetBallPosition: place, findAvailableWidgetPanelPosition: placePanel } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
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
const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y
const tuner = { x: 102, y: 356, width: 288, height: 220 }
const metro = placePanel(402, 874, 288, 176, { x: 102, y: 220 }, [tuner])
assert.equal(intersects({ ...metro, width: 288, height: 176 }, tuner), false, 'Metronome cannot cover the open tuner')
const tray = { x: 266, y: 72, width: 288, height: 220 }
const pitchOnStand = placePanel(820, 1180, 288, 220, { x: 266, y: 72 }, [tray])
assert.equal(intersects({ ...pitchOnStand, width: 288, height: 220 }, tray), false, 'Stand tools cannot cover the Workspace tray')
const metroOnStand = placePanel(820, 1180, 288, 176, { x: 266, y: 138 },
  [tray, { ...pitchOnStand, width: 288, height: 220 }])
assert.equal(intersects({ ...metroOnStand, width: 288, height: 176 }, tray), false)
assert.equal(intersects({ ...metroOnStand, width: 288, height: 176 },
  { ...pitchOnStand, width: 288, height: 220 }), false, 'Stand panels cannot cover each other')
console.log('Widget placement: balls and expanded panels avoid each other and the stand tray.')
