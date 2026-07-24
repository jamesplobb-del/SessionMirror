/**
 * Validates the canonical BestTake icon before Capacitor Assets generates
 * platform-specific sizes. The artwork lives in assets/icon.png and must never
 * be recreated from an older procedural design here.
 *
 * Run: node scripts/generate-app-icon.mjs
 */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(import.meta.url), '..', '..')
const pngPath = join(root, 'assets', 'icon.png')

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('Missing sharp. Run: npm install --save-dev sharp')
  process.exit(1)
}

let metadata
try {
  metadata = await sharp(pngPath).metadata()
} catch (error) {
  console.error(`Could not read canonical app icon at ${pngPath}`)
  console.error(error)
  process.exit(1)
}

if (metadata.format !== 'png' || metadata.width !== 1024 || metadata.height !== 1024) {
  console.error(
    `Canonical app icon must be a 1024×1024 PNG; received ${metadata.width ?? '?'}×${
      metadata.height ?? '?'
    } ${metadata.format ?? 'unknown'}.`,
  )
  process.exit(1)
}

console.log('Validated canonical app icon: assets/icon.png')
