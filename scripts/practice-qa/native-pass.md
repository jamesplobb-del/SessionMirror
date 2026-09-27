# Physical iPhone QA — September 26, 2026

Tested the current working tree on the connected iPhone 15 Pro (iOS 26.6.2), using a separately signed **BestTake QA** app. The user's regular BestTake installation and data were not replaced. This is an in-progress native pass, not exhaustive certification.

## Fixed and verified

The Home “Try a suggested routine” action now opens instrument suggestions directly. `src/components/MusicRoutineBuilder.tsx` preserves the incoming `presets` mode instead of changing it to `build`. The existing premium components and design were retained. The fix was verified through the actual iPhone UI and the regression checks both suggested and saved-routine entry modes.

Checks passed: TypeScript/full Vite build; signed native iPhone Debug build; suggested-entry regression; practice routines, routine music, routine preset tools, and routine program sharing checks.

## Actual phone observations

- Selected Trumpet in onboarding; Home showed the separate empty QA library.
- Opened suggested Fundamentals, named it QA, saved it, started it, and paused it. Tuner and the configured drone appeared; pausing showed “Paused.”
- Fully restarted the app. The instrument, saved routine, and paused state survived.
- Imported the synthetic QA-score.pdf through the native Files picker. Native logs confirm writing the chart into Documents/charts.
- Opened the PDF, fully restarted the app, then reopened it through Continue music. The document rendered successfully after restart. **The browser PDF-loss bug did not reproduce on this phone.**

Detailed cases: [native session log](sessions/2026-09-26-native.json). Build and native logs: `results/native-evidence/` (local, ignored by Git).

## Multitrack follow-up

The explicitly launched QA bundle imported `QA-two-part.btmulti`, saved its two synthetic audio parts, and reopened the same project after a full process restart. Native file-write logs and a local-storage snapshot were saved under `results/native-evidence/`. An earlier apparent project loss did **not** reproduce under controlled bundle identity, so it is not a confirmed data-loss bug.

Trim, mute, and volume controls responded during earlier phone interaction, but that interaction was not anchored by an active QA console. It is exploratory evidence only; edited-state persistence still needs a controlled rerun.

Audio-only export is an open limitation. Multitrack Render & preview calls `renderMultitrackVideo`, which rejects at `BestTakeAudioPlugin.swift` when the first source has no video track (`A panel video could not be read. Relink the missing take and retry.`). The app discards that text and shows `Could not render the multitrack video. Please try again.` Share video and Save to Take Vault use the same path. The older `renderCreatorStudioVideo` reject is not this flow. The controlled QA retry reached the export sheet but was interrupted when the phone became active. No renderer changes were made and video export is not certified.

Trim and position are written into the saved project only when Editor → Done runs. Mute and volume are written as soon as they change, then saved about 200 ms later. A restart with the Editor still open should keep mute and volume and drop unsaved trim and position. That split has not been repeated on the phone.

Repeat that case: launch **BestTake QA**, import the synthetic two-part project, choose Export → Render & preview, and capture the native rejection. Expected: an export matching the supported project, or a clear explanation of an unsupported format. Current source instead reaches the generic retry message. Retrying unchanged audio-only input cannot fix the missing video track. A full fix needs an explicit audio-only rendering path plus device validation; simply hiding the failure would not fix export.

Five additional checks passed: chart ink/PDF drawing, metronome programs, daily challenge persistence/retries, native asset decoding with a mocked filesystem, and reference preview contracts. They are included in `checks.json`; they do not count as native UI coverage.

## Pending and blocked

iPhone Mirroring reports that microphone input is unavailable from the Mac. The user reported silent playback in the test setup, then confirmed the regular app records and plays correctly and asked us to test elsewhere. Audio investigation was stopped. The candidate playback change was fully reverted and **never installed**. There is no new recording/playback fix from this pass.

The latest device retry stopped because Mirroring reported “iPhone in Use.” Remaining gaps include controlled edited-project persistence, successful native export, complete games, camera capture, comparison, headphones/Bluetooth, and interruptions. The browser-only writer and PDF persistence defects remain open; native PDF reopening passed. No exhaustive every-button claim is made.

## Repeating this setup

See [README.md](README.md). `prepare-native.mjs` copies the current native tree plus built dist into an ignored workspace, isolates bundle and app-group identifiers, and labels it BestTake QA. The copy also exposes its Documents folder in Files for synthetic fixtures and disables telemetry. Synthetic capture and game input are disabled. Production app files are not changed by this setup. Because QA enables document access in place, this pass does not certify the release app's incoming-document handoff semantics.

Do not overwrite an existing QA workspace or personal install to rerun. Reuse the isolated app for persistence; archive the generated workspace when preparing a new clean one. Preserve at least 40% weekly usage; the latest usage check showed 49% remaining. Stop launching new batches at 50% and preserve the 40% floor.
