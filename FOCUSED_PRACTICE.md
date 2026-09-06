# Focused practice and references

## Session foundation — September 5, 2026

The second pass also adds optional existing metronome programs, per-source reference passage/position memory, item journals from the recap, archived title snapshots, and compact session controls. The user requested handoff at 17% remaining; see the latest checkpoint in `PRACTICE_SESSION_HANDOFF.md` for implementation status and runtime checks still needed.

See `PRACTICE_SESSION_HANDOFF.md` for the current implementation contracts, verification, and the remaining work. The session layer now guards navigation, resumes open sittings, retains daily routine history, separates temporary desks from presets, offers explicit comparison targets, and waits for SQLite persistence before reporting a saved take. The sections below include prior UI/API implementation history; the handoff describes the current behavior.

## Guided routine builder

The current visual pass uses geometric Avenir typography (with platform fallbacks), cool blue surfaces, layered cobalt accents, and illuminated primary controls. The custom list offers tappable suggestions from the selected instrument’s template set directly beneath the item input; selection appends items in order.

Reference setup is now a visible card in each item editor and during custom tool setup, rather than an advanced setting. It explains the actual behavior: starting an item with a query opens in-app YouTube search, the user chooses the recording, and a previously pinned reference takes priority. The suggested query combines the selected instrument with the item title; the hard-coded Haydn trumpet placeholder has been removed. Custom queries persist per item. Trumpet-specific book suggestions are restricted to trumpet, and clarinet break drills are restricted to clarinets.

Home’s “Build routine” opens the full-screen `GuidedRoutineBuilder`: instrument → exercise selection → ordered lineup → save → routine library. A remembered instrument skips the first question. Six instrument-specific exercises appear initially; additional choices live under “More exercises.” “Build your own” asks for a name and main tool, saves the exercise, and returns to the picker with it selected. The recorder preset uses the current camera/audio surface; existing desk settings can be included.

The lineup opens the existing step editor, with tools/references and books/exercises behind optional disclosures. All recording, desk restoration, reference search, and practice-history behavior continues through the existing routine callbacks. Save returns to the library; “Use this routine” puts it on Today. Removing it from Today keeps a library copy.

Saved routine and exercise libraries are device-local (`besttake:routine-library:v1` and `besttake:exercise-library:v1`), validated by the existing routine parsers. They do not sync across devices. The shared repository contains the UI and native web assets; the YouTube server credential remains on Netlify. No API credential changes are needed for this UI.

The guide supports light/dark appearance, phone/tablet layouts, safe areas, keyboard navigation, haptic selection, and Reduce Motion. Validation for this change is the TypeScript/production build and Capacitor iOS asset sync; no browser or simulator interaction pass was requested.

### Instrument research basis

The picker now starts with an individual template set and builds both Quick Essentials and Complete Session presets from that instrument’s own exercise IDs. The underlying categories were checked against teacher and professional-association material: Yamaha’s trumpet pedagogy (air, middle-register sound, flow, scales, lip flexibility); International Horn Society guidance (entrances, harmonic slurs, lip trills, stopped horn, transposition, and planned rest); National Flute Association pedagogy levels and practice resources (tone, harmonics, finger work, scales, articulation, and dynamic control); International Clarinet Association guidance (voicing, register slurs, break coordination, and bass-clarinet low-register work); International Double Reed Society material (oboe air/face/tongue/fingers, drone work, bassoon register stability, flicking/venting, and articulation); ASTA-aligned string curricula (bowing, intonation, scales, shifting, instrument-specific hand frames); Guitar Foundation of America technique material (two-hand coordination, scales, and arpeggios); Berklee bass curricula (scales, arpeggios, groove, muting, transcription, and performance runs); NATS voice pedagogy (SOVT, glides, sustained vowels, registration, and articulation); and MTNA piano pedagogy (scales, arpeggios, chords, hand independence, and sight-reading).

Reference pages:

- https://hub.yamaha.com/music-educators/instruments/winds-instruments/trumpet-pedagogy/
- https://www.hornsociety.org/hornzone/642-three-things-you-should-practice-every-day
- https://www.nfaonline.org/docs/default-source/default-document-library/nfa-guide-to-levels-for-pedagogy-publications.pdf
- https://clarinet.org/developing-a-healthy-clarinet-practice/
- https://clarinet.org/pedagogy-corner-not-like-others-playing-strategies-e-flat-bass-clarinet/
- https://www.idrs.org/video/collection/oboe-warm-ups-short-teachable-and-doable-exercises-for-every-level/
- https://www.idrs.org/MIDI/MIDI_HP.htm
- https://www.stringeducation.org/lessons/string-warm-ups
- https://www.guitarfoundation.org/page/MarianoAguirre2020
- https://online.berklee.edu/takenote/bass-players-how-to-practice-bass-effectively-pt1/
- https://www.nats.org/cgi/page.cgi/5/_articles.html/Pedagogy/The_Five_Best_Vocal_Warm-Up_Exercises
- https://www.mtna.org/Reading.html

## Today’s practice refinement

Home now prioritizes the next routine item, with other practice items under “Practice something else.” Routine is the daily plan; tuner, metronome, and recorder steps all bind to reusable project IDs so attempts and references accumulate in the same journal. Existing bindings are retained. Unbound steps recover their exact routine/step binding from SQLite or create a project on first start; names are never used to merge histories. Games and checklist-only steps remain lightweight.

The running routine uses one compact session bar instead of also displaying the standalone focus strip. Camera and audio capture remain the existing implementations. The post-take menu distinguishes retrying from completing the item. Completing the final item closes its sitting and saves its desk; switching to independent practice pauses the routine.

Saved references restore automatically. For an item with a reference search query and no saved selection, the reference browser opens with suggestions for the user to choose. It no longer silently bookmarks the first search result. Temporary desk changes are remembered for that routine item on that day. The routine preset is changed only by editing the routine or choosing “Use these tool settings next time.” Standalone focus keeps its separate project desk memory.

The practice loop now keeps an excerpt and its attempts together:

- Home → Focus: create and start an item in one action, or continue the most recent item.
- The recorder's focus strip opens References, Progress, or an optional adjustment for the next attempt.
- After recording, the existing Compare / Note / Try again menu stays in place. YouTube comparisons open the expanded workspace with the reference and current take. Local take comparisons use the review player.
- Restored references wait for a Play tap. During Focus, YouTube pauses for recording. Normal practice keeps the user's play-along preference.
- Progress is a separate journal of this project's focused takes, across sittings. It shows dates, intentions, reflections, and optional personal ratings. Choose an earlier attempt as the comparison baseline, or listen to any attempt.
- Done for now closes the sitting and exits Focus. Continuing starts a fresh sitting while keeping the same excerpt and accumulated takes.
- Each practice item remembers its selected YouTube reference and desk. Closing Workspace saves the current focus desk, even before another recording. Saving an existing desk name updates it instead of making a duplicate.

## Reference library

Search and saved references share the existing YouTube link dialog and Capacitor-safe player. Search terms start with the practice item name; search runs only on submit. Choosing a result saves it and loads it. The Saved tab puts references associated with this item first and opens by default when this item already has saved references. Direct links can also be named, saved, and loaded.

The library and per-project selected video IDs are stored on this device in `besttake:practice-references:v1`. Removing a bookmark does not unload an active reference. Unloading the reference box or choosing a local benchmark clears the selected YouTube reference for that project. Switching projects restores the destination's selected reference. These bookmarks do not sync between devices.

Recorded takes remain in the existing SQLite vault. The session-foundation pass adds nullable routine_id and routine_step_id columns to practice_sessions through an idempotent, additive migration. The journal derives its entries from saved take metadata. Ratings are personal notes, not an automated performance score.

## Enable live search

Live search was configured and deployed on September 5, 2026 to the existing Netlify player site. Production endpoint: `https://stalwart-salamander-9451ab.netlify.app/.netlify/functions/youtube-search`. The local app build is configured to use it. Google Cloud project `besttake-reference-search` has YouTube Data API v3 enabled; its API-restricted credential is stored as a Netlify secret for production and deploy previews. No paid Google billing was enabled.

Setup for other environments:

1. Enable YouTube Data API v3 in a Google Cloud project and create a credential restricted to that API.
2. Deploy `netlify-youtube-proxy` with its `netlify.toml` (publish `.`; functions `functions`) to the existing player proxy site. Set `YOUTUBE_DATA_API_KEY` in the site's server environment. Never give this key a `VITE_` prefix or put it in the app bundle.
3. Set `YOUTUBE_SEARCH_ORIGINS` to any additional allowed web origins, comma separated. Capacitor localhost and the current proxy origin are already allowed. Local browser testing needs its exact origin, such as `http://127.0.0.1:5179`.
4. Set the app build's `VITE_YOUTUBE_SEARCH_ENDPOINT` to `https://<proxy-host>/.netlify/functions/youtube-search`, then rebuild. The existing player origin remains unchanged.
5. Configure hosting-level rate limits and monitor Google quota before public release. The function's ten-request-per-minute limit is per warm instance, not a distributed abuse control. It also caches matching searches for 15 minutes within an instance.

The function returns up to eight embeddable, externally playable videos. Network failures, unavailable search, no results, invalid links, and storage failures have explicit UI states. YouTube can still restrict or remove a video after it appears in search; playback remains subject to the existing embedded player's availability handling.

API reference: https://developers.google.com/youtube/v3/docs/search/list

## Verification

- `node scripts/verify-focus-practice.mjs` exercises production bookmark/desk helpers, URL validation, search transport and server behavior, storage failures, project isolation, caching and rate limits. It also runs the actual practice and vault repositories against an in-memory SQLite database, testing multiple sittings and preserved attempt metadata after reopening.
- `npm run build` checks TypeScript and produces the web build.
- Browser checks cover create-and-start, the reference dialog, unavailable-search guidance, named link saving/loading, the saved library, the journal empty state, paused reference restoration, and one-tap continuation after reopening.

- iPhone 17 simulator: native build and launch passed; a focused recording was saved and appeared in its excerpt journal with a date and Listen action.
- Live preview and production searches returned eight Michael Sachs results, including Cleveland Orchestra recordings. Production accepted the Capacitor app origin. Deployment preserved the existing hosted player unchanged.

Physical iPhone microphone recording and audible A/B playback still need a device pass. Simulator and live API checks do not establish regional playback availability or production capacity.

## Integrated menu design

Home uses a single continuation card, followed by another-focus and quick-record actions. The setup menu creates and starts a new focus in one step. Existing Games, Vault, Tuner, and Metronome shortcuts remain available.

The shared ControlDeck supplies the updated focus strip and post-take menu in both camera and audio mode. References and Progress use their existing dialogs; Desk & tools opens the existing workspace tray. Try again calls the existing recording handler, Compare opens the existing comparison player, and ratings are under an optional disclosure. Finish saves the focus desk, ends the sitting, and returns to Home. Camera capture, audio capture, mode switching, and playback implementations were not replaced.

Validation: web build, focus persistence checks, and native iPhone 17 simulator build/launch passed. Browser inspection verified Home's continuation hierarchy and the focus controls over the existing camera view. Physical-device audio and camera testing remains a separate pass.
