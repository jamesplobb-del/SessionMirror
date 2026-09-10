# Simplified fullscreen playback

Removed current/best selection, A/B blind/reveal, comparison graph and extra focused-practice comparison rows. The bottom retains playback, waveform, share, pin, info, pitch and delete in every context.

Waveform tap opens trim handles and Cancel/Save; no standing Trim button. Dragging still seeks. Pointer cancellation does not open trim. Enter/Space provides equivalent keyboard access. Entering trim clears resume intent before the scrub completes.

One pitch button toggles the playback widget for video, audio and Vault. Microphone-off is now respected by the audio tuner tracker. Generated 440 Hz audio was detected as A4 at 440.1 Hz in the browser.

The audio test uncovered a lifecycle bug: fullscreen effects depended on the entire playback context, which changes with transport progress. This repeatedly closed/reopened the player and sought back to the beginning. Those effects now depend on stable controller methods. Browser audio subsequently advanced normally.

Browser checks confirmed no comparison buttons or standing Trim action, pitch widget visibility/readout, and trim handles/actions appearing after waveform tap. Trim metadata and playback-route regression checks passed. Native media trimming and playback on the user's phone remain device verification items.

Simplified playback integrated and verified: TypeScript/production build, Capacitor sync and unsigned generic-iOS Debug build passed; all 72 bundled web files match. Removed comparison controls, made the main pitch button consistently toggle playback analysis, gated trimming behind waveform interaction, and fixed repeated fullscreen-audio initialization on transport updates. Xcode opened for phone testing.
