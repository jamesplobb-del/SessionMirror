# Practice chart overlay — implement exactly this

Read this file. Then implement. Do **not** explore the repo for other approaches. Do **not** refactor. Do **not** add PDF.js, PDFKit, annotation, `.4sc`, MusicXML, setlists, page-turn pedals, document types, or routine-step wiring.

Stop when the checklist at the bottom is done.

## What it is

On the existing camera/audio practice surface, the musician can put a **PDF or photo of music** behind the widgets they already have (tuner, metronome, drone, record). forScore stays the library and pencil. BestTake only displays a copy.

iPad is the target. Phone can show the same UI; do not special-case a second layout.

## Reuse — do not rebuild

| Job | Already exists | Use |
|---|---|---|
| Pick PDF/image | `src/multitrack/sheetMusic/sheetMusicUtils.ts` | Same `accept` string: `application/pdf,image/*` |
| Draw PDF | `src/multitrack/sheetMusic/SheetMusicPanel.tsx` ~242–246 | Copy the `<object type="application/pdf">` / `<img>` pair. Do **not** extract a shared component. |
| Persist a blob | `src/utils/libraryStorage.ts` `persistLibraryAudio` | Same Filesystem + base64 pattern, new dir `charts/` |
| Widget overlays | `App.tsx` floating tuner/metronome/drone | Leave them. Chart sits **under** that layer. |
| Project id | current practice `projectId` in `App.tsx` | Chart is keyed to that project |

## Files you may touch

**Create**

- `src/utils/practiceChartStorage.ts`
- `src/components/PracticeChartLayer.tsx`
- `src/components/practice-chart.css`

**Edit**

- `src/utils/filesystemInit.ts` — add `CHARTS_DIR = 'charts'` and mkdir next to `LIBRARY_DIR`
- `src/App.tsx` — mount the layer; pass `projectId`. **Do not** add settings, desks, or HUD wheel keys.

Do not edit: `SheetMusicPanel.tsx`, `workspaceDesks.ts`, `appSettings.ts`, `SettingsBranchWheel.tsx`, `practiceRoutines.ts`, `Info.plist`, native Swift, games, multitrack.

## Storage

`src/utils/practiceChartStorage.ts`

```ts
export interface PracticeChart {
  projectId: string
  filePath: string      // native path under charts/, or '' on web
  objectUrl: string     // blob/object URL for <object>/<img>
  mimeType: 'application/pdf' | `image/${string}`
  fileName: string
}

export function chartVisibleKey(projectId: string): string
export async function loadPracticeChart(projectId: string): Promise<PracticeChart | null>
export async function savePracticeChart(projectId: string, file: File): Promise<PracticeChart>
export async function deletePracticeChart(projectId: string): Promise<void>
export function isChartVisible(projectId: string): boolean
export function setChartVisible(projectId: string, visible: boolean): void
```

- Native: write file to `Directory.Data` / `charts/{projectId}.{pdf|jpg|png}`. Metadata in `localStorage` key `besttake:practice-chart:v1:{projectId}` = `{ filePath, mimeType, fileName }`.
- Web: metadata + IndexedDB is extra. For web, keep the blob in memory / `indexedDB` only if copy-paste from `libraryStorage` web branch is trivial; otherwise **native-only persist**, web uses `URL.createObjectURL` for the session (same as current `libraryStorage` web branch).
- Visibility: `localStorage` `besttake:practice-chart-visible:v1:{projectId}` = `'1'` | `'0'`. Default hidden until they add a file; adding a file sets visible.
- Max one chart per project. Replacing the file overwrites.
- Reject mime types other than `application/pdf` and `image/jpeg|png|webp`.
- No annotation fields. No page index to persist (PDF object handles scroll).

## UI

`PracticeChartLayer`

Props: `{ projectId: string; active: boolean }`  
`active` is true on the main camera/audio practice surface only (same places the floating widgets already show). Off on Games, Vault sheets, Settings, Multitrack.

**Hidden, no file:** a single compact control, bottom-leading, above the record orbit, label **Music**. Tap → hidden file input (`accept` from `sheetMusicAcceptAttribute()`). After pick, save + show.

**Hidden, has file:** same **Music** control. Tap shows the chart (does not re-pick). Long-press or a tiny chevron: Replace / Remove.

**Visible:**

- `position: fixed; inset: 0; z-index: 4` (camera stays live underneath — **do not stop the camera session**)
- Opaque paper/white (or app background) so the camera does not show through
- PDF/image fills the layer using the SheetMusicPanel object/img markup
- Pinch/pan: copy the pointer handlers from `SheetMusicPanel.tsx` only if they work in one pass; otherwise skip custom gestures and let the PDF `<object>` scroll natively
- Close control (X): hide, keep file
- Do not cover the staff with a big chrome bar. Controls are small, corners, safe-area inset
- Existing widgets stay on top and draggable. Do not re-parent them

Empty picker copy: `Add music` / `PDF or photo from Files or forScore (Share → BestTake is later).`  
Do not mention forScore in a competing way. No markup tools.

## App.tsx (only this)

1. Lazy-import `PracticeChartLayer` next to the other lazy widget imports.
2. Render it as a sibling **immediately after** `LiveCameraBackground`, only when the floating widget layer is showing.
3. Pass the current `projectId`.
4. Do not gate on `isTabletViewport`. Do not change camera start/stop. Do not add `showChart` to `AppSettings`.

## Hard no

- `.4sc` / `.4ss` / forScore packages
- Pencil, highlighter, stamps
- `CFBundleDocumentTypes` for `public.pdf` (share-sheet “Open in” is v2)
- Wiring `RoutineStep` to a chart
- New navigation tab or “Scores” library
- PDF.js, pdfjs-dist, PDFKit, WKWebView extra plugins
- Stopping/restarting `getUserMedia` or the native camera when toggling Music
- Tests, new verify scripts, analytics events
- Redesign of widgets, HUD, or desks

## Done when

- On iPad practice surface: Music → pick a PDF → page fills screen, tuner/click/drone still float, record still works
- Hide Music → camera/widgets unchanged, file still there next launch for that project
- Replace / Remove work
- A photo of music works the same as a PDF
- Multitrack sheet panel still behaves as before (untouched)

If something extra seems useful, do not add it. This is the whole feature.
