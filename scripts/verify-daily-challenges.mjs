import assert from 'node:assert/strict'
import { build } from 'esbuild'
const memory = new Map()
let fail = false
 globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => { if (fail) throw new Error('Full'); memory.set(key, value) },
}
const built = await build({ entryPoints: ['src/utils/dailyChallenges.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const c = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)
const first = new Date(2026, 8, 8, 12)
assert.equal(c.awardChallenge('practice', first), true)
assert.equal(c.awardChallenge('practice', first), false)
assert.equal(c.awardChallenge('game', first), true)
assert.equal(c.trophyCount(c.loadChallengeProgress()), 2)
assert.equal(c.characterUnlocked('cat'), false)
assert.equal(c.awardChallenge('game', new Date(2026, 8, 9, 12)), true)
assert.equal(c.characterUnlocked('cat'), true)
assert.equal(c.trophyCount(c.loadChallengeProgress()), 3)
assert.equal(c.characterUnlocked('unknown'), false)
fail = true
assert.equal(c.awardChallenge('practice', new Date(2026, 8, 10, 12)), false)
fail = false
assert.equal(c.trophyCount(c.loadChallengeProgress()), 3)
assert.equal(c.retryChallengeRewards(), true)
assert.equal(c.trophyCount(c.loadChallengeProgress()), 4)
memory.clear()
c.recordRoutineChallenge({ date: c.challengeDate(), doneStepIds: ['a'], elapsedMsByStep: { a: 59000 } })
assert.equal(c.trophyCount(c.loadChallengeProgress()), 0)
c.recordRoutineChallenge({ date: '2000-01-01', doneStepIds: ['a'], elapsedMsByStep: { a: 90000 } })
assert.equal(c.trophyCount(c.loadChallengeProgress()), 0)
c.recordRoutineChallenge({ date: c.challengeDate(), doneStepIds: ['a'], elapsedMsByStep: { a: 60000 } })
assert.equal(c.trophyCount(c.loadChallengeProgress()), 1)
memory.clear()
memory.set('besttake.practiceGames.character', 'fox')
memory.set('besttake:balance', JSON.stringify({ unlockedCharacterIds: ['bird'] }))
assert.equal(c.characterUnlocked('fox'), true)
assert.equal(c.characterUnlocked('bird'), true)
memory.set(c.CHALLENGE_STORAGE_KEY, '{broken')
assert.equal(c.trophyCount(c.loadChallengeProgress()), 0)
assert.equal(c.awardChallenge('game'), false, 'Corrupt rewards must not be silently overwritten')
assert.equal(memory.get(c.CHALLENGE_STORAGE_KEY), '{broken')
memory.clear()
assert.equal(c.recordGameChallenge({ game: 'balance', completed: false }), false)
assert.equal(c.recordGameChallenge({ game: 'staff-jumper', correctNotes: 7 }), false)
assert.equal(c.recordGameChallenge({ game: 'staff-jumper', correctNotes: NaN }), false)
assert.equal(c.recordGameChallenge({ game: 'staff-jumper', correctNotes: 8 }), true)
assert.equal(c.recordGameChallenge({ game: 'balance', completed: true }), false, 'Alternative games share one daily reward')
console.log('Daily challenges passed: daily caps, rollover, thresholds, old unlocks, routine duration, corrupt storage, and failed writes.')
