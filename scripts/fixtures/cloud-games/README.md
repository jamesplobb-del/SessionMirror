# BestTake cloud-world comparison

Local, isolated browser review of the current BestTake games beside a floating-cloud Three.js presentation. Production game engines, app routes, package dependencies, and assets are not changed by this fixture.

## Open

From the BestTake repository root:

```sh
./node_modules/.bin/vite --config scripts/fixtures/cloud-games/vite.config.ts
```

Open <http://127.0.0.1:5195/scripts/fixtures/cloud-games/>. Use the game tabs and Phone / Tablet / Landscape selector. Full size opens either side on its own. The notation slider reserves 38–55% of Staff Jumper's screen for a flat, readable score; 45% is the default. On landscape tablets, the score sits beside the route so both have enough height.

The shared controls simulate note input, pause, reset, and in-tune long tones. Balance's pitch slider demonstrates flat/sharp lean and stops progress outside ±10 cents. No microphone is opened; this is a visual and interaction fixture, not a replacement game engine.

## Reused musical UI

The current side renders the actual LabsMenu, StaffJumperGame, BalanceScene, Learn NoteStaff, and FingeringChart. The proposed side uses those same lesson data and engraving primitives. CloudScore uses StaffGlyph, StaffRest, layoutRhythm, getTargetNoteAtStep, and source staff constants, with current and upcoming notes enlarged for phone reading. No generated image supplies musical notation or fingering diagrams.

The displayed instrument is B-flat trumpet. Learn's written beginner notes and valve combinations use the actual instrument data. The cloud world has no additional guessed instrument models.

## Artwork and rendering

The floating platforms, pavilion and bridges are real Three.js geometry, with live lighting, camera movement and softly layered procedural cloud atmosphere. Otto is a transparent illustrated sprite in that world, with a game-supplied contact shadow. His face returns to BestTake's existing Otto illustration after the glossy toy character looked wrong at game size.

Final artwork: `assets/otto-illustrated.png`. It was edited with the built-in image generation tool, preserving the familiar mascot while replacing the inaccurate toy horn. Exact final prompt is saved in `ASSET_PROMPT.txt`.

Reference anatomy: [Yamaha trumpet parts](https://www.yamaha.com/en/musical_instrument_guide/trumpet/mechanism/) and [Yamaha YTR-2330 product photograph](https://au.yamaha.com/en/musical-instruments/brass-woodwinds/products/trumpets/bb-trumpets/ytr-2330/). These photographs were editing references, not shipped artwork. The final instrument is a stylized illustration and should receive musician/art-director review before production use.

Vendored Three.js 0.180.0 and RoomEnvironment retain their MIT license in `vendor/LICENSE`; production dependencies are unchanged. Pixel ratio is capped, rendering pauses when hidden, reduced-motion is respected, and each scene disposes its resources.

## Checks

```sh
./node_modules/.bin/tsc -p scripts/fixtures/cloud-games/tsconfig.json --noEmit
./node_modules/.bin/vite build --config scripts/fixtures/cloud-games/vite.config.ts
```

The temporary production bundle goes to `/private/tmp/besttake-cloud-review-build`. Browser verification covers shared note/score state, pause/reset, Learn Previous/Next and fingerings, Balance shared timing/intonation, notation bounds, and all four modes at phone, tablet and landscape sizes. A separate 844×390 landscape-phone check confirms Learn’s complete C4 staff, ledger line and fingering row remain visible. Recorded results are in `verification.json`. Synthetic controls demonstrate the presentation without changing production musical input or gameplay.
