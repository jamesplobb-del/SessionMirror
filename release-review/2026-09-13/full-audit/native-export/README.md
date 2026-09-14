# Native multitrack export evidence

The production `renderMultitrackVideo` method and its dependent helpers were extracted by `../make-render-harness.py`. `Renderer-original.swift` retains that extracted production logic with only bridge scaffolding and removal of Objective-C exposure. `Main.swift` supplies controlled red/440 Hz and blue/880 Hz test clips, invokes the renderer and decodes audio for measurement.

The original renderer crashed in the iOS 26.5 simulator's Core Animation/IOSurface path. Its crash report is retained. No complete original-path export was obtained. This is not a confirmed physical-device crash.

`Renderer.swift` adds one diagnostic condition: setting `AUDIT_SKIP_DECORATIONS=1` skips `AVVideoCompositionCoreAnimationTool`. The five MP4s and results in this folder were generated under that condition. They establish limited composition, trim, offset and mixer behavior. They do not certify production export, sheet overlays, the native bridge, the app's export interface, its library-save step or the share sheet.

The harness was compiled with the installed iPhoneSimulator SDK for arm64, installed as `com.besttake.audit.render` on the iPhone 17 Pro simulator, and launched using XcodeBuildMCP. The diagnostic Main.swift reuses `red440.mov` and `blue880.mov` in Documents from the initial fixture-generation run. For a clean run, replace that URL-only declaration in `run()` with:

```swift
let a = try await makeClip("red440", 440, .red)
let b = try await makeClip("blue880", 880, .blue)
```

Delete only this harness's prior generated fixture/output files before repeating on the same test app. `results.json` retains simulator paths for provenance; copied MP4s in this directory are the corresponding outputs. PNG frames were decoded with macOS AVAssetImageGenerator and visually inspected. The diagnostic bypass was not applied to the BestTake app.
