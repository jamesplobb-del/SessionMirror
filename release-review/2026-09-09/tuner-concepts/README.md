# Tuner concepts — review only
Live review: http://127.0.0.1:5190/tuner-review.html?colors=on&v=2

Clear Signal: blue trace and restrained target lane.
Liquid Silk: teal ribbon with soft depth.
Prism: indigo/cyan fading point history.

Uses the actual isolated app's tuner layout and tool/control positions. The right-hand concept substitutes illustrative graph/readout data. Sample states, appearance, and motion switches support comparison. Reactive tuner colors are enabled by default at the user's request and can be toggled. The left-hand tuner uses the preview's generated input and can show Listening when input is unavailable.

No production tuner logic or appearance has been changed. These files depend on the isolated preview app and are not standalone production replacements.

Reactive Silk follow-up: bright mint-green (#00f29b), gold, and coral follow the existing 5¢/15¢ zone boundaries. History segments retain their pitch colors as they travel left; the live marker and screen wash follow the latest sample. Marker center is 44 CSS pixels from the right edge, with a 33-pixel steady halo and white core. The concept's original synthetic-input wash is disabled so it cannot tint over the sample-driven colors. Still review-only; no production tuning behavior changed.

Latest preview motion: approximately 60fps, 65ms pitch-response smoothing, longer fine-grained history and a gentle non-flashing halo. Illustrative pitch includes subtle variation; production must follow measured input and must not manufacture pitch motion.

Owner preferred the previous motion: restored 64-point history, prior response smoothing and refresh cadence, and steady halo. Brighter colors and 44-pixel endpoint inset retained. Supersedes the latest preview-motion experiment above.

Green target zone restored: visible translucent green band spans the existing ±5¢ in-tune range, with soft boundary lines. Visual size now follows the graph scale; pitch tolerance remains unchanged.

Target label now sits 18 pixels below the green band’s lower boundary so it cannot overlap the zone. Restored previous gold-yellow (#ffca05) for line, marker and matching wash.

Sharp/Flat labels now appear only on the left. Preserve the existing useLivePitchCoach → TuningGauge coach path on implementation: actual Pitch Insights observations, held-note delay, transposition filtering, and drone suppression. The concept shows an explicitly labeled tendency example beneath the note, hidden while Listening. No production coaching logic was changed.
