import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Small, deterministic PCM fixtures: audible half-second pulses every second.
// Distinct frequencies let a decoded mix be checked for both parts later.
const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results', 'media')
fs.mkdirSync(directory, { recursive: true })
const sampleRate = 44100, seconds = 4, samples = sampleRate * seconds
for (const frequency of [440, 660]) {
  const bytes = Buffer.alloc(44 + samples * 2)
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36)
  bytes.writeUInt32LE(samples * 2, 40)
  for (let index = 0; index < samples; index++) {
    const t = index / sampleRate, phase = t % 1
    const envelope = phase < 0.5 ? Math.min(1, phase / 0.01, (0.5 - phase) / 0.01) : 0
    bytes.writeInt16LE(Math.round(32767 * 0.12 * envelope * Math.sin(2 * Math.PI * frequency * t)), 44 + index * 2)
  }
  const file = path.join(directory, `qa-pulses-${frequency}hz.wav`)
  fs.writeFileSync(file, bytes)
  console.log(file)
}
