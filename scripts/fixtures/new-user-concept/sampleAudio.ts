import type { Take } from '../../../src/types'
const urls: string[] = []
export function sampleTake(index: number, seconds = 8): Take {
  const rate = 16000, frames = rate * seconds, bytes = new ArrayBuffer(44 + frames * 2), data = new DataView(bytes)
  const word = (offset: number, value: string) => [...value].forEach((letter, i) => data.setUint8(offset + i, letter.charCodeAt(0)))
  word(0, 'RIFF'); data.setUint32(4, 36 + frames * 2, true); word(8, 'WAVE'); word(12, 'fmt ')
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true)
  data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true)
  word(36, 'data'); data.setUint32(40, frames * 2, true)
  const notes = [233.08, 261.63, 293.66, 349.23, 293.66, 261.63, 233.08, 233.08]
  for (let i = 0; i < frames; i++) {
    const t = i / rate, beat = t % 1, f = notes[Math.floor(t) % notes.length]
    const envelope = Math.min(1, beat * 20) * Math.max(0, Math.min(1, (0.85 - beat) * 10))
    const vibrato = index % 2 ? 0.0015 * Math.sin(t * 31) : 0.004 * Math.sin(t * 26)
    const value = (Math.sin(2 * Math.PI * f * t * (1 + vibrato)) + 0.15 * Math.sin(4 * Math.PI * f * t)) * envelope
    data.setInt16(44 + i * 2, value * 4600, true)
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); urls.push(url)
  return { id:`concept-take-${index}-${Date.now()}`,name:`First phrase · Take ${index}`,videoUrl:url,filePath:'',videoMimeType:'audio/wav',mediaType:'audio',thumbnailUrl:'',timestamp:Date.now(),duration:seconds,rating:0,notes:'' }
}
window.addEventListener('pagehide', () => urls.forEach(url => URL.revokeObjectURL(url)), { once:true })

