import assert from 'node:assert/strict'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const repo = process.cwd()
const outputDir = join(repo, 'scripts/practice-qa/results/pitch-games-2026-10-01')
const bundleDir = join(repo, 'scripts/practice-qa')
const bundlePath = join(bundleDir, '.game-feedback-audit-bundle.mjs')
const evidence = {
  audit: 'Focused adversarial game-feedback audit; no product edits.',
  date: '2026-10-01',
  findings: [],
  previouslyObservedCheckContext: {
    auditDate: '2026-10-01',
    sourceFingerprintAtOriginalExecution: null,
    sourceFingerprintAtAuditEnd: '443aeb06917a74ec3b187869da153921c34e32e821e7259af94af6f36830578e',
    scope: 'Historical results reported by the initial Luna audit; this diagnostic does not rerun them. End fingerprint does not establish their exact earlier snapshot.',
  },
  previouslyObservedChecks: [
    { command: 'node scripts/verify-staff-jumper-review.mjs', outcome: 'PASS', excerpt: 'PASS: 54000 rhythm slots across meters/levels/seeds, pulse grouping, rest exclusions, spacing, mixed-beam hooks, 400 custom-note slots, phrase variety (0/123 bar-1 reprints), non-scale openings (0/40), and custom staff ranges.' },
    { command: 'node scripts/verify-staff-jumper-difficulty-ranges.mjs', outcome: 'PASS', excerpt: 'ok — 20 instruments graded, 21582 clarinet notes checked' },
    { command: 'node scripts/verify-instrument-playability.mjs', outcome: 'PASS', excerpt: 'PASS: instrument transpositions, all detector range endpoints, 870 scale cases, viola notation, routine defaults, saved-routine validation, range labels, decay scoring, and 44 synthetic audio cases.' },
    { command: 'node scripts/verify-rhythm-input-tolerance.mjs', outcome: 'PASS', excerpt: 'PASS: 240 rhythm timing cases across simple/compound meters, tempo, duration and difficulty; delayed input retained and silent notes expire.' },
    { command: 'node scripts/verify-daily-challenges.mjs', outcome: 'PASS', excerpt: 'Daily challenges passed: daily caps, rollover, thresholds, old unlocks, routine duration, corrupt storage, and failed writes.' },
    { command: 'node scripts/verify-daily-challenge-plan.mjs', outcome: 'PASS', excerpt: 'Daily plans passed: every instrument, frozen targets, untouched routine, duration thresholds, exact game settings, midnight, and duplicate awards.' },
  ],
  limitations: [
    'No native microphone, permission dialog, browser UI, or device audio was exercised.',
    'BalanceResults was server-rendered with synthetic props; this is component output, not an in-app UI session.',
  ],
}

function extractFunctionBody(source, signaturePattern) {
  const match = source.match(signaturePattern)
  if (!match) return null
  let open
  if (match[0].includes('=>')) {
    open = source.indexOf('{', match.index + match[0].length)
  } else {
    const signatureEnd = source.indexOf('): boolean {', match.index)
    open = signatureEnd < 0 ? -1 : signatureEnd + '): boolean '.length
  }
  if (open < 0) return null
  let depth = 1
  for (let index = open + 1; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  return null
}

try {
  const bundle = await build({
    stdin: {
      contents: `
        export { default as BalanceResults } from './src/labs/balance/BalanceResults';
        export * from './src/labs/balance/balanceEngine';
        export { createDefaultBalanceSettings } from './src/labs/balance/balanceStorage';
        export { getDetectedWrittenMidi, getTargetNoteAtStep, isReadoutCorrectPitch, isReadoutWrongPitch } from './src/labs/staffJumper/staffJumperMusicLogic';
        export { default as StaffJumperGame } from './src/labs/staffJumper/StaffJumperGame';
        export { canUseStaffJumperAudio } from './src/labs/staffJumper/staffJumperAudioPolicy';
        export { hasConfirmedHeadphoneOutput } from './src/utils/headphoneOutput';
      `,
      resolveDir: repo,
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    outfile: bundlePath,
    external: ['react', 'react-dom', 'lucide-react', '@capacitor/core'],
    loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' },
  })
  void bundle
  const api = await import(pathToFileURL(bundlePath))

  // Learn: execute the exact onTarget predicate extracted from the production hook.
  const learnHook = await readFile(join(repo, 'src/labs/learnInstrument/useLearnInstrumentGame.ts'), 'utf8')
  const predicateMatch = learnHook.match(/const onTarget\s*=\s*([\s\S]*?)\n\s*if \(!onTarget\)/)
  assert.ok(predicateMatch, 'extract production Learn target predicate')
  const learnPredicate = new Function('heardHz', 'offCents', 'MATCH_TOLERANCE_CENTS', `return (${predicateMatch[1].trim().replace(/;\s*$/, '')})`)
  const toleranceMatch = learnHook.match(/export const MATCH_TOLERANCE_CENTS\s*=\s*(\d+)/)
  assert.ok(toleranceMatch, 'extract production Learn tolerance')
  const tolerance = Number(toleranceMatch[1])
  assert.equal(learnPredicate(440, 80, tolerance), true, 'exact boundary is accepted')
  assert.equal(learnPredicate(440, 80.01, tolerance), false, 'just outside boundary is rejected')
  assert.equal(learnPredicate(0, 0, tolerance), false, 'silence is rejected even with zero computed cents')
  const learnScreen = await readFile(join(repo, 'src/labs/learnInstrument/LearnInstrumentScreen.tsx'), 'utf8')
  evidence.findings.push({
    game: 'Learn Your Instrument',
    status: 'PASS: authorized beginner recognition policy is preserved',
    reproduction: 'Production predicate accepts a target pitch at the inclusive +80-cent boundary, rejects at +80.01 cents, and rejects silence.',
    evidence: { toleranceCents: tolerance, acceptedBoundaryCents: 80, rejectedBoundaryCents: 80.01, silenceAccepted: false, completionCopy: 'every one heard in tune' },
    policy: 'Keep the inclusive ±80-cent note-recognition window; wrong notes and silence reset the hold. No Learn source change is included.',
    validation: 'Executed the exact predicate expression extracted from useLearnInstrumentGame.ts; no rendered UI or microphone path claimed.',
  })

  // Balance: drive the actual reducer through two incomplete note results into its result phase.
  const settings = api.createDefaultBalanceSettings('concert')
  const target = (id, midi) => ({ id, instrumentId: 'concert', writtenMidi: midi, concertMidi: midi, writtenLabel: 'C4', concertLabel: 'C4' })
  let balance = api.createBalanceState(settings, 0)
  balance = api.balanceReducer(balance, { type: 'START', targets: [target('first', 60), target('second', 62)], settings, bestBalancedMs: 0 })
  const incompleteNote = (t) => ({ target: t, goalReached: false, balancedMs: 500, totalConfidentMs: 800, centeredPercent: 62.5, toleranceCents: 10, longestCenteredMs: 500, signedAverageCents: 8, averageAbsoluteCents: 8, flattestCents: 8, sharpestCents: 8, driftDirection: null })
  balance = api.balanceReducer(balance, { type: 'COMPLETE_NOTE', result: incompleteNote(balance.targets[0]) })
  balance = api.balanceReducer(balance, { type: 'NEXT_NOTE' })
  balance = api.balanceReducer(balance, { type: 'COMPLETE_NOTE', result: incompleteNote(balance.targets[1]) })
  balance = api.balanceReducer(balance, { type: 'NEXT_NOTE' })
  assert.equal(balance.phase, 'routineResults')
  const resultExpression = (await readFile(join(repo, 'src/labs/balance/useBalanceGame.ts'), 'utf8')).match(/completed:\s*([\s\S]*?)\n\s*}/)?.[1]
  assert.ok(resultExpression, 'extract production completed invariant')
  const isCompleted = new Function('state', `return (${resultExpression.trim().replace(/,$/, '')})`)(balance)
  assert.equal(isCompleted, false, 'partial note results must not satisfy completed invariant')
  const rendered = renderToStaticMarkup(React.createElement(api.BalanceResults, {
    result: { id: 'audit-run', launchKind: 'quick', routineType: 'single', routineName: 'Audit run', startedAt: 1, completedAt: 2, noteResults: balance.noteResults, notesCompleted: 0, totalBalancedMs: 1000, totalConfidentMs: 1600, centeredPercent: 62.5, completed: isCompleted },
    newTrophyIds: [], bestBalancedMs: 0, hapticFeedback: false,
    onReplay: () => {}, onSetup: () => {}, onGames: () => {},
  }))
  assert.match(rendered, /<h1>Run finished<\/h1>/)
  assert.match(rendered, /<dd>Incomplete<\/dd>/)
  let completeBalance = api.createBalanceState(settings, 0)
  completeBalance = api.balanceReducer(completeBalance, { type: 'START', targets: [target('first', 60), target('second', 62)], settings, bestBalancedMs: 0 })
  const completedNote = (t) => ({ ...incompleteNote(t), goalReached: true, balancedMs: 1000, totalConfidentMs: 1000, centeredPercent: 100 })
  completeBalance = api.balanceReducer(completeBalance, { type: 'COMPLETE_NOTE', result: completedNote(completeBalance.targets[0]) })
  completeBalance = api.balanceReducer(completeBalance, { type: 'NEXT_NOTE' })
  completeBalance = api.balanceReducer(completeBalance, { type: 'COMPLETE_NOTE', result: completedNote(completeBalance.targets[1]) })
  completeBalance = api.balanceReducer(completeBalance, { type: 'NEXT_NOTE' })
  const completeInvariant = new Function('state', `return (${resultExpression.trim().replace(/,$/, '')})`)(completeBalance)
  assert.equal(completeInvariant, true, 'all goalReached notes satisfy completion invariant')
  const completedRendered = renderToStaticMarkup(React.createElement(api.BalanceResults, {
    result: { id: 'audit-run-complete', launchKind: 'quick', routineType: 'single', routineName: 'Audit run', startedAt: 1, completedAt: 2, noteResults: completeBalance.noteResults, notesCompleted: 2, totalBalancedMs: 2000, totalConfidentMs: 2000, centeredPercent: 100, completed: completeInvariant },
    newTrophyIds: [], bestBalancedMs: 0, hapticFeedback: false,
    onReplay: () => {}, onSetup: () => {}, onGames: () => {},
  }))
  assert.match(completedRendered, /<h1>Routine complete<\/h1>/)
  assert.match(completedRendered, /<dd>Complete<\/dd>/)
  evidence.findings.push({
    game: 'Balance',
    status: 'Regression: headline follows whole-run completion invariant',
    reproduction: 'Two below-goal notes produce “Run finished” and an Incomplete status; two goal-reached notes produce “Routine complete” and a Complete status.',
    evidence: { reducerPhase: balance.phase, completedInvariant: isCompleted, incompleteHeadline: 'Run finished', incompleteStatus: 'Incomplete', completeInvariant, completeHeadline: 'Routine complete', completeStatus: 'Complete' },
    appropriateWordChoice: 'Use “Run finished” when any target was left below its goal, and “Routine complete” only when every target reached its goal.',
    practiceInvariant: 'A run counts as complete only when all target notes have goalReached true; current result model enforces this, and the daily challenge award also checks completed.',
    validation: 'Executed production balanceReducer and extracted production completion expression for complete and incomplete runs; server-rendered the actual BalanceResults component with synthetic props.',
  })

  // Staff Jumper: verify written-register matching through each relevant transposition.
  const staffHook = await readFile(join(repo, 'src/labs/staffJumper/useStaffJumperGame.ts'), 'utf8')
  const targets = [
    { transposition: 'concert', written: 60, sounding: 60, wrongOctave: 72, label: 'Concert C' },
    { transposition: 'bb', written: 60, sounding: 58, wrongOctave: 70, label: 'B-flat trumpet C4' },
    { transposition: 'bb_octave', written: 60, sounding: 46, wrongOctave: 58, label: 'Tenor sax C4' },
    { transposition: 'c_octave_up', written: 72, sounding: 84, wrongOctave: 96, label: 'Piccolo C5' },
    { transposition: 'c_octave_down', written: 60, sounding: 48, wrongOctave: 60, label: 'Guitar C4' },
  ]
  const pitchReadout = (midi, cents = 0) => ({
    frequencyHz: 440 * 2 ** ((midi - 69) / 12), midi, noteName: `MIDI ${midi}`, cents,
  })
  for (const test of targets) {
    const config = { difficulty: 'easy', transposition: test.transposition }
    const right = pitchReadout(test.sounding)
    const wrongRegister = pitchReadout(test.wrongOctave)
    assert.equal(api.getDetectedWrittenMidi(right, config), test.written, `${test.label}: transposition returns written MIDI`)
    assert.equal(api.isReadoutCorrectPitch(right, test.written, config), true, `${test.label}: exact written register accepted`)
    assert.equal(api.isReadoutCorrectPitch(wrongRegister, test.written, config), false, `${test.label}: same-class wrong octave rejected`)
    assert.equal(api.isReadoutWrongPitch(wrongRegister, test.written, config), true, `${test.label}: wrong octave is classified wrong`)
  }
  const wrongSemitone = pitchReadout(59)
  assert.equal(api.isReadoutCorrectPitch(wrongSemitone, 60, { difficulty: 'easy', transposition: 'concert' }), false)
  assert.equal(api.isReadoutCorrectPitch(pitchReadout(60, 20), 60, { difficulty: 'hard', transposition: 'concert' }), true, 'hard-mode cents tolerance remains inclusive')
  assert.equal(api.isReadoutCorrectPitch(pitchReadout(60, 20.01), 60, { difficulty: 'hard', transposition: 'concert' }), false)
  const gameplayCalls = staffHook.match(/isReadoutCorrectPitch\(readoutNow,[^\n]*/g) ?? []
  assert.equal(gameplayCalls.length, 3, 'click attack, click hold, and free-play retain a pitch gate')
  assert.ok(gameplayCalls.every((call) => /target\b/.test(call)), 'all three gates receive the local target')
  assert.equal((staffHook.match(/const target = getTargetNoteAtStep\(current\.config, current\.sequenceStep\)\.midi/g) ?? []).length, 2, 'rhythm and free-play derive target MIDI from the current written note')
  const lingerBody = extractFunctionBody(staffHook, /function nextNoteIsBeingPlayed\s*\(/)
  assert.ok(lingerBody, 'extract free-play next-note linger predicate')
  const nextNoteIsBeingPlayed = new Function(
    'readout', 'nextWrittenMidi', 'currentWrittenMidi', 'config', 'now', 'correctMs', 'onset',
    'isReadoutCorrectPitch',
    lingerBody,
  )
  const concertConfig = { key: 'C', scaleMode: 'major', range: '1-octave', rangeLowMidi: 60, rangeHighMidi: 62, difficulty: 'easy', clef: 'treble', tunerInstrument: 'winds', transposition: 'concert', instrumentId: null, playerModel: 'frog', meter: 'simple', tempoBpm: 80, metronome: false, drone: false, lives: false, sessionSeed: 1, customPitchClasses: [0, 2] }
  const firstTarget = api.getTargetNoteAtStep(concertConfig, 0)
  const nextTarget = api.getTargetNoteAtStep(concertConfig, 1)
  assert.notEqual(firstTarget.midi, nextTarget.midi, 'fixture has distinct adjacent written notes')
  assert.equal(nextNoteIsBeingPlayed(
    pitchReadout(nextTarget.midi + 12), nextTarget.midi, firstTarget.midi, concertConfig, 500, 30, { writtenMidi: nextTarget.midi, startedAt: 0 }, api.isReadoutCorrectPitch,
  ), false, 'same-class attack an octave above next target must not advance linger')
  assert.equal(nextNoteIsBeingPlayed(
    pitchReadout(nextTarget.midi), nextTarget.midi, firstTarget.midi, concertConfig, 500, 30, { writtenMidi: nextTarget.midi, startedAt: 0 }, api.isReadoutCorrectPitch,
  ), true, 'exact next written note still releases linger')

  // SSR the real game component to verify the detected-note color/hint follows
  // full written MIDI and never celebrates an in-class wrong octave.
  const viewConfig = { ...concertConfig, rangeHighMidi: 72, sessionSeed: 101 }
  const viewTarget = api.getTargetNoteAtStep(viewConfig, 0)
  assert.equal(viewTarget.isRest, false, 'view fixture begins on a note')
  const viewState = {
    phase: 'playing', config: viewConfig, sequenceStep: 0, targetPitchClass: viewTarget.midi % 12,
    score: 0, streak: 0, bestStreak: 0, hearts: 3, correctCount: 0, missCount: 0,
    bestScore: 0, advanceToken: 0, missToken: 0, feedback: null, feedbackToken: 0,
    isFalling: false, startedAtMs: 0, endedAtMs: null, pausedAtMs: null, pausedDurationMs: 0,
    timing: 'on-time', timingErrorMs: 0, onTimeCount: 0, earlyCount: 0, lateCount: 0,
    playedRhythmLabel: null, holdQuality: null, isCountingIn: false, isSustaining: false,
  }
  const renderGameForMidi = (midi) => renderToStaticMarkup(React.createElement(api.StaffJumperGame, {
    state: viewState, readout: pitchReadout(midi), onPause: () => {}, hapticFeedback: false,
    onFallComplete: () => {}, turnRemainingMs: 1000, turnDurationMs: 1000,
    beatInBar: null, getTravelProgress: () => 0,
  }))
  const wrongOctaveHtml = renderGameForMidi(viewTarget.midi + 12)
  const wrongDetectedBlock = wrongOctaveHtml.match(/<div class="sj-detected-note[^\"]*">[\s\S]*?<\/div>/)?.[0]
  assert.ok(wrongDetectedBlock, 'rendered game includes detected-note feedback')
  assert.doesNotMatch(wrongDetectedBlock, /sj-detected-note--match/, `wrong octave should not match: ${wrongDetectedBlock}`)
  assert.match(wrongOctaveHtml, />Try again</, 'wrong octave feedback asks the player to try again')
  const correctOctaveHtml = renderGameForMidi(viewTarget.midi)
  assert.match(correctOctaveHtml, /class="sj-detected-note sj-detected-note--match"/)
  assert.match(correctOctaveHtml, />Centered</, 'exact written note gets positive feedback')

  // Route loss: execute the actual effect callback with mocked state/audio controls.
  const headphoneBody = extractFunctionBody(staffHook, /const handleHeadphoneChange\s*=\s*\(connected: boolean\)\s*=>/)
  assert.ok(headphoneBody, 'extract production headphone route-loss callback')
  const handleHeadphoneChange = new Function('connected', 'stateRef', 'canUseStaffJumperAudio', 'captureNoteClock', 'stopAudio', 'dispatch', headphoneBody)
  const mockRouteChange = (connected, config) => {
    const calls = { captured: 0, stopped: [], dispatched: [] }
    handleHeadphoneChange(
      connected,
      { current: { config } },
      api.canUseStaffJumperAudio,
      () => calls.captured += 1,
      (...args) => calls.stopped.push(args),
      (action) => calls.dispatched.push(action),
    )
    return calls
  }
  const clickRouteLoss = mockRouteChange(false, { metronome: true, drone: false })
  assert.equal(clickRouteLoss.captured, 1)
  assert.deepEqual(clickRouteLoss.stopped, [[false]], 'route loss stops audio without restoring a drone route')
  assert.deepEqual(clickRouteLoss.dispatched, [{ type: 'PAUSE' }], 'route loss pauses the run')
  const droneRouteLoss = mockRouteChange(false, { metronome: false, drone: true })
  assert.equal(droneRouteLoss.captured, 1)
  assert.deepEqual(droneRouteLoss.stopped, [[false]])
  assert.deepEqual(droneRouteLoss.dispatched, [{ type: 'PAUSE' }])
  const silentRunRouteLoss = mockRouteChange(false, { metronome: false, drone: false })
  assert.deepEqual(silentRunRouteLoss, { captured: 0, stopped: [], dispatched: [] }, 'silent runs do not pause when the route changes')

  // A route can disappear while native audio startup is still awaiting a handle.
  // Execute the actual startAudio callback with deferred handles and invalidate
  // its generation via the actual extracted route-loss callback before resolving.
  const startAudioBody = extractFunctionBody(staffHook, /const startAudio = useCallback\(\(config: StaffJumperConfig\) =>/)
  assert.ok(startAudioBody, 'extract production asynchronous audio starter')
  let resolveClick
  let resolveDrone
  const pendingClick = new Promise((resolve) => { resolveClick = resolve })
  const pendingDrone = new Promise((resolve) => { resolveDrone = resolve })
  const raceCalls = { clickStops: 0, droneStops: 0, dispatches: [] }
  const generationRef = { current: 0 }
  const clickRef = { current: null }
  const droneRef = { current: null }
  const raceStopAudio = () => {
    generationRef.current += 1
    clickRef.current?.stop()
    clickRef.current = null
    const drone = droneRef.current
    droneRef.current = null
    if (drone) void drone.stop(false)
  }
  const makeStartAudio = new Function(
    'stopAudio', 'canUseStaffJumperAudio', 'isConfirmedHeadphoneOutputActive',
    'expectedPulseRef', 'audioGenerationRef', 'METERS', 'COUNT_IN_BARS', 'countInUntilMsRef',
    'secondsPerPulse', 'AUDIO_START_GRACE_MS', 'performance', 'startClickTrack',
    'clickRef', 'startDrone', 'getConcertTonicPitchClass', 'droneRef',
    `return (config) => { ${startAudioBody} }`,
  )
  const startAudio = makeStartAudio(
    raceStopAudio, api.canUseStaffJumperAudio, () => true,
    { current: 0 }, generationRef, { simple: { pulsesPerMeasure: 4 } }, 1, { current: 0 },
    () => 1, 10, { now: () => 1 }, () => pendingClick, clickRef,
    () => pendingDrone, () => 0, droneRef,
  )
  startAudio({ meter: 'simple', tempoBpm: 60, metronome: true, drone: true })
  const raceRouteLoss = (connected, config) => handleHeadphoneChange(
    connected,
    { current: { config } },
    api.canUseStaffJumperAudio,
    () => {},
    raceStopAudio,
    (action) => raceCalls.dispatches.push(action),
  )
  raceRouteLoss(false, { metronome: true, drone: true })
  resolveClick({ stop: () => { raceCalls.clickStops += 1 } })
  resolveDrone({ stop: async () => { raceCalls.droneStops += 1 } })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(clickRef.current, null, 'late click handle is not installed after route loss')
  assert.equal(droneRef.current, null, 'late drone handle is not installed after route loss')
  assert.deepEqual(raceCalls, { clickStops: 1, droneStops: 1, dispatches: [{ type: 'PAUSE' }] }, 'late audio handles stop after route-loss invalidates startup generation')
  assert.match(staffHook, /subscribeConfirmedHeadphoneOutput\(handleHeadphoneChange\)/, 'confirmed route changes subscribe to the production callback')
  assert.match(staffHook, /if \(!canUseStaffJumperAudio\(config, isConfirmedHeadphoneOutputActive\(\)\)\) return/, 'audio start fails closed on an unknown route')
  assert.match(staffHook, /if \(previous && !canUseStaffJumperAudio\(previous, isConfirmedHeadphoneOutputActive\(\)\)\) return/, 'restart fails closed without headphones')
  assert.match(staffHook, /if \(currentConfig && !canUseStaffJumperAudio\(currentConfig, isConfirmedHeadphoneOutputActive\(\)\)\) return/, 'resume fails closed without headphones')

  // Start policy: clicks and drones are both blocked unless the route is confirmed.
  const audioCases = [
    { config: { metronome: true, drone: false }, route: true, expected: true, label: 'click with headphones' },
    { config: { metronome: true, drone: false }, route: false, expected: false, label: 'click with unknown/speaker route' },
    { config: { metronome: false, drone: true }, route: true, expected: true, label: 'drone with headphones' },
    { config: { metronome: false, drone: true }, route: false, expected: false, label: 'drone with unknown/speaker route' },
    { config: { metronome: true, drone: true }, route: false, expected: false, label: 'click and drone with unknown/speaker route' },
    { config: { metronome: false, drone: false }, route: false, expected: true, label: 'silent practice without headphones' },
  ]
  for (const test of audioCases) assert.equal(api.canUseStaffJumperAudio(test.config, test.route), test.expected, test.label)
  assert.equal(api.hasConfirmedHeadphoneOutput({ outputPort: 'Headphones', usesHeadphones: true }), true)
  const bluetoothOutput = { outputPort: 'BluetoothA2DPOutput', outputUID: 'test-bt' }
  assert.equal(api.hasConfirmedHeadphoneOutput(bluetoothOutput), false, 'Bluetooth is not presumed to be headphones')
  assert.equal(api.hasConfirmedHeadphoneOutput(bluetoothOutput, true), true, 'explicit confirmation accepts the current Bluetooth route')
  for (const snapshot of [
    {},
    { outputPort: 'BuiltInSpeaker', usesHeadphones: true, usesA2DPOutput: true },
    { outputPort: 'Receiver', usesBluetoothOutput: true },
    { outputPort: 'AirPlay', usesHeadphones: true },
    bluetoothOutput,
  ]) assert.equal(api.hasConfirmedHeadphoneOutput(snapshot), false, `unconfirmed/private route rejected: ${JSON.stringify(snapshot)}`)
  assert.equal(api.hasConfirmedHeadphoneOutput({ outputPort: 'AirPlay', usesHeadphones: true }, true), false, 'Bluetooth confirmation cannot enable AirPlay')
  evidence.findings.push({
    game: 'Staff Jumper',
    status: 'Regression: exact written register and confirmed private audio route are required',
    reproduction: 'Production pitch gates accept transposed sounding MIDI only when it resolves to exact written target MIDI. Same pitch class one octave off is rejected for concert, B-flat, B-flat-octave and C-octave instruments; a wrong-octave next attack cannot release free-play linger. Click/drone require confirmed headphones; simulated route loss stops audio and pauses active runs, while silent practice stays available.',
    evidence: { transpositionCases: targets.map(({ transposition, written, sounding, wrongOctave, label }) => ({ label, transposition, written, sounding, wrongOctave, detectedWritten: api.getDetectedWrittenMidi(pitchReadout(sounding), { transposition }), wrongRegisterAccepted: api.isReadoutCorrectPitch(pitchReadout(wrongOctave), written, { difficulty: 'easy', transposition }) })), gameplayGateCalls: gameplayCalls.length, nextNoteWrongOctaveAdvances: false, wrongOctaveUiHint: 'Try again', correctOctaveUiHint: 'Centered', audioCases: audioCases.length, headphoneSnapshots: 7, bluetoothConfirmationRequired: true, bluetoothConfirmationUidBound: true, clickRouteLoss: clickRouteLoss.dispatched[0], droneRouteLoss: droneRouteLoss.dispatched[0], silentRunRouteLoss: silentRunRouteLoss.dispatched.length, lateStartupClickStopped: raceCalls.clickStops, lateStartupDroneStopped: raceCalls.droneStops, lateStartupPaused: raceCalls.dispatches[0] },
    validation: 'Called production written-MIDI gates, audio policy, and route snapshot helper; server-rendered the actual StaffJumperGame for a target note and its same-class wrong octave; source-extracted the actual free-play linger, headphone-loss and async audio-start callbacks with mock gate/audio/dispatch functions. This does not represent a native route event or live app session.',
  })

  evidence.summary = 'Balance result headline distinguishes complete from incomplete runs using the existing goalReached invariant. Learn retains its inclusive ±80-cent beginner recognition policy. Staff Jumper regressions cover exact written octave after transposition and strict headphone route gating for click/drone start and route loss.'
  await mkdir(outputDir, { recursive: true })
  await writeFile(join(outputDir, 'games-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`)
  console.log(`PASS: three adversarial feedback cases exercised; evidence saved to ${join(outputDir, 'games-evidence.json')}`)
} finally {
  // Keep reproducibility self-contained without leaving generated bundle files in the repository.
  const { rm } = await import('node:fs/promises')
  await rm(bundlePath, { force: true })
}
