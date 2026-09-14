# Instrument coverage at the first checkpoint

All 26 Home profiles were inspected in source. The existing game suite exercised 29 game profiles across 870 generated scale cases. No live instrument was physically played by the auditor. This matrix records configured behavior, not certification of each instrument. Full exported lesson data summaries are in `instrument-probes.json`.

| Home instrument | Written-pitch setting | Detector bounds, Hz | Hands-free gate |
|---|---|---:|---:|
| Soprano recorder | c_octave_up | 38–3300 | 16 |
| Trumpet | bb | 38–3300 | 34 |
| French horn | f | 38–3300 | 24 |
| Trombone | concert | 38–3300 | 34 |
| Euphonium / baritone | bb_octave | 38–3300 | 24 |
| Tuba | concert | 38–3300 | 24 |
| Flute | concert | 38–3300 | 16 |
| Piccolo | c_octave_up | 38–3300 | 24 |
| Clarinet (B♭) | bb | 38–3300 | 24 |
| Bass clarinet | bb_octave | 38–3300 | 24 |
| Soprano sax | bb | 38–3300 | 34 |
| Alto sax | eb | 38–3300 | 34 |
| Tenor sax | bb_octave | 38–3300 | 34 |
| Baritone sax | eb_octave | 38–3300 | 34 |
| Oboe | concert | 38–3300 | 24 |
| Bassoon | concert | 38–3300 | 24 |
| Violin | concert | 38–1700 | 16 |
| Viola | concert | 38–1700 | 16 |
| Cello | concert | 38–1700 | 16 |
| Double bass | c_octave_down | 38–1700 | 16 |
| Guitar | c_octave_down | 38–1700 | 16 |
| Bass guitar | c_octave_down | 38–1700 | 16 |
| Ukulele | concert | 38–1700 | 16 |
| Voice | concert | 65–1100 | 16 |
| Piano / keys | concert | 38–1700 | 16 |
| Something else | concert | 65–1100 | 16 |

Gate values are heuristics and require device/room calibration. Bounds describe detection filters; they are not assertions about each instrument’s complete musical range.

## Reference checks and remaining review

- Trumpet: high B♭ primary fingering checked visually against [Yamaha](https://www.yamaha.com/en/musical_instrument_guide/trumpet/play/play002.html); confirmed discrepancy. Other upper fingerings require chart-by-chart verification.
- Euphonium/tuba: [Yamaha notation conventions](https://www.yamaha.com/en/musical_instrument_guide/tuba/trivia/trivia012.html) support separate concert bass-clef and transposing treble-clef options. The app currently mixes them across surfaces.
- Piccolo: [VSL notation/range](https://www.vsl.co.at/academy/woodwinds/piccolo) supports the octave transposition and exposes the unhandled upper range.
- Clarinet, bass clarinet, F horn and flute: instrument references located/read; detailed fingering and all-register comparison remains incomplete: [clarinet](https://www.vsl.co.at/academy/woodwinds/clarinet), [bass clarinet](https://www.vsl.co.at/academy/woodwinds/bass-clarinet), [F horn](https://www.vsl.co.at/academy/brass/horn-f), [flute](https://www.vsl.co.at/academy/woodwinds/concert-flute).
- Oboe, bassoon, viola, cello and double bass: source and instrument references reviewed at the convention level; full playable-range/pedagogy verification remains incomplete: [oboe](https://www.vsl.co.at/academy/woodwinds/oboe), [bassoon](https://www.vsl.co.at/academy/woodwinds/bassoon), [viola](https://www.vsl.co.at/academy/strings/viola), [cello](https://www.vsl.co.at/academy/strings/cello), [double bass](https://www.vsl.co.at/academy/strings/double-bass).
- Saxophone family: [Yamaha family overview](https://hub.yamaha.com/winds/wood/whats-the-difference-between-soprano-alto-tenor-and-baritone-saxophones/) located; octave conversions have automated examples. Full fingering tables and model-specific limits remain to be checked.
- Bass guitar: [Yamaha five-string reference](https://hub.yamaha.com/guitars/bass/back-to-bassics-benefits-of-a-five-string-bass/) confirms the low-B use case excluded by the current filter.
- Recorder: soprano and alto conventions must be distinguished; the current F-transposition description incorrectly suggests alto recorder. [American Recorder Society reference](https://americanrecorder.org/docs/AR_Mag_February_1976_Multipage.pdf).
- Guitar, ukulele, violin, piano and voice: profile and game arithmetic inspected; a complete independent instrument-specific teaching/notation review has not yet been done. “Other” is a generic fallback, not instrument-specific support.

## Ten Learn courses inspected in source

| Course instrument | Clef | Sounding minus written, semitones | Chromatic notes in table |
|---|---|---:|---:|
| flute | treble | 0 | 37 |
| bb-clarinet | treble | -2 | 33 |
| alto-sax | treble | -9 | 33 |
| tenor-sax | treble | -14 | 33 |
| bb-trumpet | treble | -2 | 31 |
| french-horn | treble | -7 | 32 |
| trombone | bass | 0 | 31 |
| baritone | bass | 0 | 31 |
| tuba | bass | 0 | 31 |
| soprano-recorder | treble | 12 | 25 |
