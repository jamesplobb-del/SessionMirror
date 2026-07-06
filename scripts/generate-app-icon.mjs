/**
 * Generates BestTake app icon assets from a flat two-tone waveform spec.
 * Run: node scripts/generate-app-icon.mjs
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')

const SIZE = 1024
const BAR_COUNT = 22
const BAR_WIDTH = 25
const GAP = 18
const MAX_HEIGHT = 620
const MIN_HEIGHT = 28
const ORANGE = '#F7A600'
const BLUE = '#1598FF'
const BACKGROUND = '#FFFFFF'

function distanceFromCenter(index) {
  return Math.min(Math.abs(index - 10), Math.abs(index - 11))
}

function barHeight(index) {
  const t = 1 - distanceFromCenter(index) / 10
  return MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * Math.max(0, t)
}

function buildSvg() {
  const totalWidth = BAR_COUNT * BAR_WIDTH + (BAR_COUNT - 1) * GAP
  const startX = (SIZE - totalWidth) / 2
  const radius = BAR_WIDTH / 2

  const bars = Array.from({ length: BAR_COUNT }, (_, index) => {
    const height = barHeight(index)
    const x = startX + index * (BAR_WIDTH + GAP)
    const y = (SIZE - height) / 2
    const fill = index <= 10 ? ORANGE : BLUE
    return `<rect x="${x.toFixed(3)}" y="${y.toFixed(3)}" width="${BAR_WIDTH}" height="${height.toFixed(3)}" rx="${radius}" fill="${fill}"/>`
  }).join('\n  ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none">
  <rect width="${SIZE}" height="${SIZE}" fill="${BACKGROUND}"/>
  ${bars}
</svg>
`
}

const svg = buildSvg()
const svgPath = join(root, 'assets', 'icon.svg')
const pngPath = join(root, 'assets', 'icon.png')
const iosPath = join(
  root,
  'ios',
  'App',
  'App',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'AppIcon-512@2x.png',
)
const appleTouchPath = join(root, 'public', 'icons', 'apple-touch-icon.png')

writeFileSync(svgPath, svg)

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('Missing sharp. Run: npm install --save-dev sharp')
  process.exit(1)
}

const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer()
writeFileSync(pngPath, pngBuffer)
writeFileSync(iosPath, pngBuffer)
await sharp(pngBuffer).resize(180, 180).png().toFile(appleTouchPath)

console.log('Wrote assets/icon.svg')
console.log('Wrote assets/icon.png')
console.log('Wrote ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
console.log('Wrote public/icons/apple-touch-icon.png')
