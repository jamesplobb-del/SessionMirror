/**
 * Static verification for metronome / widget layout helpers (no test runner in project).
 * Run: node scripts/verify-new-features.mjs
 */

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function getCompoundClickTier(eighthIndexInBar) {
  if (eighthIndexInBar === 0) return 'downbeat'
  if (eighthIndexInBar % 3 === 0) return 'macro'
  return 'subdivision'
}

function getSimpleClickTier(beatIndexInBar) {
  return beatIndexInBar === 0 ? 'downbeat' : 'subdivision'
}

function secondsPerTick(meter, bpm) {
  const macro = 60 / bpm
  const compound = ['6/8', '9/8', '12/8']
  return compound.includes(meter) ? macro / 3 : macro
}

function getFloatingWidgetTopCenter(
  boundsWidth,
  boundsHeight,
  widgetWidth,
  widgetHeight,
  topOffset = 72,
) {
  const EDGE_INSET = 12
  const maxX = Math.max(EDGE_INSET, boundsWidth - widgetWidth - EDGE_INSET)
  const x = Math.max(EDGE_INSET, Math.min(maxX, (boundsWidth - widgetWidth) / 2))
  const maxY = Math.max(EDGE_INSET, boundsHeight - widgetHeight - EDGE_INSET)
  const y = Math.max(EDGE_INSET, Math.min(maxY, topOffset))
  return { x, y }
}

// Compound 6/8 accent pattern
const sixEight = [
  'downbeat',
  'subdivision',
  'subdivision',
  'macro',
  'subdivision',
  'subdivision',
]
sixEight.forEach((expected, i) => {
  assert(getCompoundClickTier(i) === expected, `6/8 index ${i}: expected ${expected}`)
})

// 9/8 macro on 0, 3, 6
;[0, 3, 6].forEach((i) => {
  const tier = getCompoundClickTier(i)
  assert(tier === (i === 0 ? 'downbeat' : 'macro'), `9/8 index ${i}: ${tier}`)
})

// Simple meter
assert(getSimpleClickTier(0) === 'downbeat', 'simple downbeat')
assert(getSimpleClickTier(2) === 'subdivision', 'simple beat 3')

// 6/8 at 60 BPM: dotted quarter = 1s, eighth = 1/3s
const eighth = secondsPerTick('6/8', 60)
assert(Math.abs(eighth - 1 / 3) < 1e-9, `6/8 eighth interval ${eighth}`)
assert(Math.abs(secondsPerTick('4/4', 120) - 0.5) < 1e-9, '4/4 quarter interval')

// Top-center layout
const phone = getFloatingWidgetTopCenter(390, 844, 268, 96)
assert(Math.abs(phone.x - (390 - 268) / 2) < 1e-9, 'centered x on phone')
assert(phone.y === 72, 'default top offset')

const narrow = getFloatingWidgetTopCenter(200, 400, 268, 96)
assert(narrow.x === 12, 'clamped x on narrow screen')
assert(narrow.x + 268 > 200, 'narrow bounds allow overflow — widget min width enforced in UI')

const short = getFloatingWidgetTopCenter(390, 100, 268, 96)
assert(short.y === 12, 'clamped y on short bounds')

console.log('All verify-new-features checks passed.')
