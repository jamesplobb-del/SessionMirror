# Practice on the music — full picture

For Opus. This is the **product**, not a patch list. v1 already imports a PDF and floats ugly Music buttons over the page. That UI is wrong. Rebuild the *experience* using the tools that already exist. Do not build a forScore clone.

## The scene

A player puts an iPad on the stand. The **music is the whole screen** — a PDF or a photo of the part, including a flattened annotated PDF they shared out of forScore. Tuner, metronome, drone, and record are **small glass balls** on the edges, same language as the rest of BestTake. They drag a ball off the staff if it covers a line. They tap a ball only when they need the full widget. They hit record without leaving the page. Takes land in the **vault folder for this excerpt**. Tomorrow a routine step called “Charlier 2” opens that same folder, the same page, the click already set.

They never annotate here. They never browse a score library. They never split the screen with forScore.

## What v1 already did (keep the data, replace the chrome)

- `src/utils/practiceChartStorage.ts` — one chart per **project** (vault folder), PDF/JPEG/PNG/WebP, native disk under `charts/`
- `src/components/PracticeChartLayer.tsx` — shows the file over the practice surface
- Mounted in `App.tsx` after `LiveCameraBackground`
- **Do not stop the camera session** when music is showing; cover it with opaque paper
- **Throw away** the current Music / × / ⌄ buttons and the homemade menu. They look like a prototype because they are.

Start from that storage. The layer should feel like a **mode of the practice room**, not a sticker on top of the HUD.

## 1. Import

Accept **PDF or photo** (`application/pdf,image/*` — already in `sheetMusicUtils.ts`).

Ways in, all the same file:

- On the practice room: Music ball → Add music → Files / Photos
- Later: share sheet into BestTake (PDF UTI) — nice, not required on the first polish pass
- From a routine item: Add music on that step (see §5)

forScore workflow: Share → flattened annotated PDF. We store the copy. We do not read `.4sc`. We do not offer a pencil.

One chart per project. Replace overwrites. Remove deletes the file from that folder, not from forScore.

## 2. The page is the room

When music is showing:

- The PDF/photo is full bleed, readable, swipe/scroll for pages (native PDF object is fine; do not add PDF.js unless the iPad object cannot page)
- **Default: every practice tool is collapsed to a ball** — pitch, metronome, drone, and the music control itself. Same `useCollapsibleWidget` / `.widget-ball` (56px) as today. Do not invent a second widget system.
- Balls live on the **edges**. They must not sit on the staff by default. Remember positions (`floatingWidgetLayout` persistent ball positions already exist).
- Expand a ball: the real widget, still floating, still collapsible. Collapse: back to a ball. Audio for click/drone/tuner **must keep running while collapsed** (the existing collapsible widgets already do this — do not unmount them).
- Record stays the existing **record orbit** — one primary action. Do not add a second Record button in the music chrome.
- Take cards default **off** while music is up (`showTakeCards` already exists on the desk). Vault is a chip/count they can open, not a panel covering the page.
- Hands-free stays the existing ball/stage. It is how you record with a horn in your hands on this surface too.
- HUD that paints a full-screen scrim over the page is a bug. Audio-mode overlays that currently cover the paper must go transparent or get out of the way. The page has to stay visible.
- Hide music = paper gone, folder still has the file, balls still there if those tools are on. Show music = paper back. That is a ball or a desk toggle, not a random × in the corner.

iPad first. Phone can use the same layout; do not design a second phone-only chrome.

## 3. Recording stays BestTake

This is still record → compare → vault. The music is wallpaper.

- Record audio or video as today
- Takes save into the **current project** (the folder you are in)
- After a take, review/compare is the existing flow (split, best take) — a sheet or the existing review overlay, not a new compare product
- Do not put a timeline editor or take grid on top of the staff while they are playing

Compact means: **play on the page, tap record, listen after.** Not a DAW around the PDF.

## 4. Saved with the folder you are working on

A vault **project** is already “the folder for this excerpt.” Music belongs there, next to the takes.

- Charlier 2 folder = that PDF + those takes + that best take
- Switch folder → that folder’s music (or none)
- No global “Scores” tab, no composer browser, no setlists
- If they need to find all their Mahler, they use forScore

When you attach music, you are attaching it to **this project**, not to the app.

## 5. Routines

A routine step already knows `projectId`, a desk (which overlays, click, drone), and an optional YouTube `referenceVideoId`. Music is the same kind of pin.

**Builder (Guided + regular):** on a record/focus step, “Music” next to reference. Pick a PDF/photo. It saves onto the step’s project (create/bind the project if the step does not have one yet — same moment recording steps already bind `projectId`). Show the file name. Replace / remove. No markup editor in the builder.

**Run:** starting that step opens the practice room on that project, **shows the chart**, applies the desk. Tools come in as **balls**. Click/drone already configured. Player is looking at the page, not a setup wizard.

**Rules:**

- Opening a shared `.btplan` must still work if there is **no** PDF (student may not have the chart). Do not put blob URLs or file bytes in routine JSON.
- Do not ship the PDF inside the share file (size + copyright). The plan remembers “this step has music on its project.” Sharing the plan does not copy the PDF. If you need teacher→student music later, that is a separate payload, not this pass.
- Consecutive steps that share a project keep the same chart; visibility follows the step that is running (a step without music hides the paper even if the project has a file).
- A step with music and no project is invalid — bind the project when the file is chosen.

Inspect `RoutineBuilder.tsx`, `GuidedRoutineBuilder.tsx`, `RoutineReferenceSetup.tsx`, and `handleStartRoutineStep` / `startRoutineDayStep` in `App.tsx` before inventing new routine fields.

## 6. What this is not

- forScore: no pencil, stamps, bookmarks, setlists, Bluetooth page turns, `.4sc`
- A new tab called Scores
- PDF.js / PDFKit unless the current `<object type="application/pdf">` truly cannot page on iPad
- Stopping camera/mic to show a PDF
- New widget components that are not balls
- A second record HUD
- Storing music only in localStorage as a blob URL on native (disk, like takes)

## Quality bar

If the staff is covered by a fat “Music” pill, it is not done.  
If expanding the metronome unmounts the click, it is not done.  
If they cannot record without hiding the page, it is not done.  
If a routine item with music opens to a blank camera and a scavenger hunt, it is not done.

The page is the product. Everything else is a ball, the record orbit, or a sheet they asked for.
