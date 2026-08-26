// Verifies the App Store fields in APP_STORE_LISTING.md fit Apple's limits.
// Run: node scripts/check-listing-lengths.mjs
import { readFile } from 'node:fs/promises'

const LIMITS = {
  'App Name': 30,
  Subtitle: 30,
  Keywords: 100,
  'Promotional Text': 170,
  Description: 4000,
}

const doc = await readFile(new URL('../APP_STORE_LISTING.md', import.meta.url), 'utf8')
let failed = false

for (const [field, limit] of Object.entries(LIMITS)) {
  const section = doc.split(new RegExp(`^## ${field}`, 'm'))[1]
  if (!section) {
    console.log(`?  ${field.padEnd(17)} section not found`)
    failed = true
    continue
  }
  // Every fenced block in the section is a candidate value for that field.
  for (const [, body] of section.split(/^## /m)[0].matchAll(/```\n([\s\S]*?)\n```/g)) {
    const len = [...body.trim()].length
    const ok = len <= limit
    if (!ok) failed = true
    const preview = body.trim().split('\n')[0].slice(0, 42)
    console.log(
      `${ok ? 'ok' : 'XX'} ${field.padEnd(17)} ${String(len).padStart(4)}/${limit}  ${preview}${body.trim().length > 42 ? '…' : ''}`,
    )
  }
}

process.exit(failed ? 1 : 0)
