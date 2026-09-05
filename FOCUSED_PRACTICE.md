# Focused practice and references

## Today’s practice refinement

Home now prioritizes the next routine item, with other practice items under “Practice something else.” Routine is the daily plan; tuner, metronome, and recorder steps all bind to reusable project IDs so attempts and references accumulate in the same journal. Existing bindings are retained; unbound steps reuse an exact name match or create a project on first start. Games and checklist-only steps remain lightweight.

The running routine uses one compact session bar instead of also displaying the standalone focus strip. Camera and audio capture remain the existing implementations. The post-take menu distinguishes retrying from completing the item. Completing the final item closes its sitting and saves its desk; switching to independent practice pauses the routine.

Saved references restore automatically. For an item with a reference search query and no saved selection, the reference browser opens with suggestions for the user to choose. It no longer silently bookmarks the first search result. Desk changes made during practice are reused, and explicit tool-preset edits in the routine builder update the linked item’s desk.

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

Recorded takes remain in the existing SQLite vault; no schema or destructive migration was added. The journal derives its entries from saved take metadata. Ratings are personal notes, not an automated performance score.

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
