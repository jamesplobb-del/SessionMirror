import BestTakeAudioPlugin from './audioSessionRoute'
export interface NativeTunerPitch { frequency: number; confidence: number; rmsDb: number }
const subscribers = new Set<(pitch: NativeTunerPitch) => void>()
let installed = false
let operations: Promise<unknown> = Promise.resolve()
function enqueue(action: () => Promise<void>) {
  const result = operations.then(action, action)
  operations = result.catch(() => {})
  return result
}
export async function subscribeNativeTunerPitch(callback: (pitch: NativeTunerPitch) => void) {
  if (!installed) {
    window.addEventListener('besttake:native-tuner-pitch', event => {
      const value = (event as CustomEvent<NativeTunerPitch>).detail
      if (!value || ![value.frequency,value.confidence,value.rmsDb].every(Number.isFinite)) return
      for (const subscriber of subscribers) subscriber(value)
    })
    installed = true
  }
  subscribers.add(callback)
  try { await enqueue(async () => { if (subscribers.size) await BestTakeAudioPlugin.setNativeTunerPitchEnabled({enabled:true}) }) }
  catch(error) { subscribers.delete(callback); throw error }
  let removed = false
  return { remove: async () => {
    if (removed) return
    removed = true; subscribers.delete(callback)
    await enqueue(async () => { if (!subscribers.size) await BestTakeAudioPlugin.setNativeTunerPitchEnabled({enabled:false}) })
  } }
}
