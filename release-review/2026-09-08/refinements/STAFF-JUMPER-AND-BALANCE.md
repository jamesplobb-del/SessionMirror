# Staff Jumper and Balance review
2026-09-08. Isolated port-5190 review copy only. Production unchanged.

## Confirmed fixes
- Replaced a 6/8 cell whose quarter note crossed the dotted-quarter beat boundary without a tie; the replacement explicitly fills each compound beat. Moved dotted-eighth/sixteenth vocabulary out of Easy.
- Mixed eighth/sixteenth groups no longer receive two full-length beams. Secondary beams join only eligible notes; isolated sixteenths receive hooks.
- Sixteenth flags now draw both flags; setup preview now renders flags as well as beams.
- Added a minimum horizontal event spacing to protect short notes/rests and accidentals. Rests remain distinct timeline events, consume no pitch and never enter a beam group.
- Corrected the later highlight rule which filled hollow heads. Only half/whole notes receive ring borders; short notes remain solid. Hollow notes stay hollow in target and miss states.
- Increased character size and reduced hop height. Staff/lane placement accounts for the lowest exercise pitch plus stem clearance instead of assuming a single treble range.
- Four-bar phrases recall their opening rhythm in bar three, retaining the existing phrase-closing bars, melodic cadence and bounded-leap logic. This is a modest musicality improvement, not a complete composition engine rewrite.

## UI/features
- Custom written-note picker: at least two pitch classes from all twelve notes, across the selected octave range and within instrument bounds. Actual target and judging pitches use this pool. Explicit accidentals accompany custom notes; preset major/minor mode remains available. Current selection lasts through the mounted game settings; no named-scale library was added.
- Staff settings grouped into expandable Exercise, Instrument, and Tempo & sound panels. Clef/time/tempo shortcuts target their matching group. Results actions have consistent spacing.
- Electric Balance advanced setup replaces draggable island/rope/pitch handles with labeled crossing-time, pitch-precision and target-note controls. Existing gameplay engine and settings handlers remain in use.

## Validation
- Final TypeScript project check passed after all edits.
- verify-staff-jumper-review.mjs: 54,000 events across 2 meters, 3 levels, and 30 seeds: exact contiguous timing, measure capacity, compound-beat boundaries, rest exclusion from beams, beam pulse boundaries, minimum spacing. Dedicated mixed-beam fixture and 400 custom-note events passed.
- Browser checked custom-note picker, custom run, 4/4 and 6/8 runs with synthetic input, filled/hollow heads, character lane, finish/results menu, Balance advanced setup; keyboard changes updated crossing time from 10s to 15s and tolerance from ±10¢ to ±11¢, then restored. Synthetic input is not evidence of real instrument accuracy.
- Remaining release testing: real instruments and microphone latency, all device sizes/clefs/instruments, accessibility and reduced motion on phone, long sessions and custom-pitch edge ranges. Screenshots demonstrate layout, not frame pacing.

## Musical references
Beaming and meter: https://open-musictheory.github.io/docs/fundamentals/beams/
Compound meter: https://open-musictheory.github.io/docs/fundamentals/meter/
Phrase repetition and continuation: https://openmusictheory.github.io/sentence.html
These informed beat grouping and motif recurrence; the app's generative choices are not universal rules for all musical styles.

Changed sources are under game-review/ with original relative paths. Shared review CSS is electric-refinement.css alongside this document.
