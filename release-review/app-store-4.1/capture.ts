// An isolated local origin for launch captures. Uses the complete production UI.
// Audio comes from the existing synthetic preview source; no personal media.
import { COACH_MARKS, COACH_STORAGE_KEY, ONBOARDING_STORAGE_KEY } from '../../src/utils/tutorialContent'
localStorage.setItem(ONBOARDING_STORAGE_KEY, '1')
localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify(COACH_MARKS.map(x=>x.id)))
localStorage.setItem('besttake:developer-note-seen:v1','1')
localStorage.setItem('besttake:plus-development:v1',JSON.stringify({alphaUnlocked:true}))
if(!localStorage.getItem('launch-capture-initialized')){
  localStorage.setItem('sessionmirror:last-surface',JSON.stringify({mode:'audio',tab:'audio'}))
  localStorage.setItem('sessionmirror:settings',JSON.stringify({darkMode:false,tunerInstrument:'winds',tunerTransposition:'bb',hapticFeedback:false}))
  localStorage.setItem('launch-capture-initialized','1')
}
void import('../../src/main')
