# Tuner startup browser integration fixture

Run the repository Vite development server. Open `/scripts/fixtures/tuner-startup/index.html`.

Uses the production tuner tab, tracker, renderer and Capacitor proxy. Reads the real native method registration from Swift (or the Objective-C category if one is reintroduced). Simulates the microphone and compact frequency/confidence/RMS delivery at ~23 Hz. This does not execute Swift or measure iPhone performance. It is outside the production app entry graph.

- Normal URL: A4 appears without Reactivate. Diagnostics show one monitor start, one detector enable and zero WebKit microphone requests.
- `?legacy=1`: deliberately removes the detector method from the native header. Expect Reactivate and zero delivered frames, reproducing the regression.
- Play B4: readout becomes B4/493.9 Hz.
- Silence: Listening appears; Reactivate must not appear.
- Leave tuner: monitor and delivery both stop. Open tuner resumes.
- Instrument settings use the real production controls.

Drone hardware and the Insights database are not supplied by this focused fixture. Their warnings are expected; verify those features in the ordinary app. Perform a fresh navigation after editing fixture bootstrap code: module hot replacement cannot reinitialize Capacitor's captured global registration safely.
