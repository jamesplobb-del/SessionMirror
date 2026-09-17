# Grok Bot QA — Games and Multitrack

Dev-only. Production builds compile `BOT_QA_MODE` to `false` and drop this path.

This is the job for Grok Bots (and any agent) that exercise **Practice Games** and **Multitrack**. Do not invent product suggestions. Confirm each control does what its label, aria-label, and surrounding copy say it does. File a bug when the label and the result disagree.

## Start

```bash
npm run dev
```

Then open:

- `https://localhost:5173/?qa=1`
- or `https://localhost:5173/?qa=1&surface=games`
- or `https://localhost:5173/?qa=1&surface=multitrack`

Vite may use HTTP on some setups; use whatever origin the dev server prints.

`?qa=1` (dev only):

- Skips onboarding
- Shows a **QA** bar (Games / Multitrack)
- Turns on synthetic pitch for Staff Jumper, Balance, and Learn Your Instrument
- Auto-plays the current target note during an active run so scoring actually advances
- Seeds three labeled **video** takes (`QA Melody`, `QA Harmony`, `QA Bass`) and assigns them to empty Multitrack boxes

Turn off: close the tab, or open the app without `?qa=1`.

## Bot job (paste this)

You are QA for BestTake. Scope: Practice Games and Multitrack only.

Work from `/?qa=1`. Use the QA bar when you cannot find the real entry path.

For every control:

1. Read the visible label and `aria-label`.
2. State the intended action in one sentence.
3. Tap it.
4. Confirm the UI did that action — not a sibling screen, not a no-op, not the opposite toggle.
5. If the label is vague, the control is missing a label, or the result does not match the promise, file a bug.

Walk every workflow below at length. Stay in a game long enough for score, hearts, lock-on, or lesson progress to change. Stay in Multitrack long enough for Play all, mute, layout, mixer, editor, and vault pick to complete.

Do not recommend new features. Do not skip a control because it looks decorative. If a control is disabled, record the disabled reason and whether that reason is visible.

Report format for each failure:

- Surface (Games plaza / Staff Jumper / Balance / Learn / Multitrack)
- Control label (quote it)
- Intended action (from the label)
- Actual result
- Steps
- Screenshot

## How to judge “works as planned”

Pass only if all of these are true:

- The control’s name matches what happened (Play starts a run; Back returns; Mute silences that tile only).
- The new state is visible without guessing (selected chip, on/off text, new screen title, score change).
- Reversing the control (toggle off, Back, Pause, Remove) restores the prior state when that is the obvious contract.
- Destructive actions ask before deleting vault data. Cancel leaves data in place.

Fail if:

- The button does nothing visible.
- It does a different action than the label (e.g. “Takes” opens settings).
- It navigates to the wrong place.
- A toggle’s highlight disagrees with the setting.
- Auto pitch is on but the game never advances, never locks, or never completes a note.

---

## Practice Games

### Plaza (Games home)

Entry: QA **Games**, or Tools → **Games** tab.

| Control | Intended action | Confirm |
|---|---|---|
| Back | Leave Games, return to Record/Tools | Plaza is gone; camera or audio tools are back |
| Instrument pill | Open instrument picker | Picker lists instruments; choosing one returns to plaza with that name on the pill |
| Character portraits | Set the player used in Staff Jumper and Balance | Selected character is marked; Staff Jumper / Balance use that character |
| Staff Jumper door | Enter Staff Jumper setup | Title is Staff Jumper, not plaza |
| Balance door | Enter Balance home | Title is Balance, Today’s Challenge is visible |
| Learn door | Enter Learn Your Instrument setup | Learn setup with lesson goals |

Walk into each door. Come back. Confirm Back from a game returns to plaza, not out of Games entirely — unless the label says otherwise (Staff Jumper back label is “Back to Practice Games”).

### Staff Jumper

Stay for a full run, not one tap.

**Setup**

| Control | Intended action | Confirm |
|---|---|---|
| Play | Start a round | Playing field appears; after count-in, notes are asked; QA auto pitch advances steps and score |
| Back to Practice Games | Return to plaza | Plaza, not a frozen jumper canvas |
| Key / tempo edit (hero) | Open more options | Options expand |
| Shuffle | New example exercise on the staff preview | Preview notes change |
| Level / Range / Tempo chips | Cycle that setting | Chip value changes; staff preview updates to match |
| More options / Hide options | Show or hide extra settings | Panel appears/disappears |
| Scale Major / Minor | Change scale | Key list and preview match the scale |
| Key buttons | Set key | Selected key is highlighted; preview redraws |
| Instrument family / instrument | Set horn and written pitch | Instrument name and transposition update |
| Clef | Change staff clef | Preview clef changes |
| Meter | Change time signature | Preview meter changes |
| Tempo − / + | Nudge BPM | Number changes and stays in range |
| Metronome toggle | Click on/off for the run | State text/highlight matches; Play with it on has an audible/visible pulse if the device can |
| Drone toggle | Drone on/off | State matches; headphones warning appears when on |
| Player model (if shown) | Change character | Selection matches plaza character or updates it |

**During a run**

| Control | Intended action | Confirm |
|---|---|---|
| Pause | Freeze the round | Pause overlay; notes stop advancing |
| Resume | Continue the same round | Same score/hearts; play continues |
| Settings (pause) | Back to setup | Setup screen, not plaza |
| Games (pause) | Back to plaza | Plaza |

**After a run**

| Control | Intended action | Confirm |
|---|---|---|
| Play Again | New round with the same setup | Playing starts; score resets |
| Settings | Setup | Setup, previous options still selected |
| Games | Plaza | Plaza |

Confirm auto pitch: hearts do not instantly dump; correct notes increment score; a finished run shows results. Tap-to-play still works if you tap the playfield (pause button must remain tappable, not swallowed by the tap layer).

Repeat with at least two difficulties, two instruments (Bb trumpet and concert), metronome on and off.

### Balance

**Home**

| Control | Intended action | Confirm |
|---|---|---|
| Back to Practice Games | Plaza | Plaza |
| Instrument pill | Instrument picker | Choosing a horn returns home with the new name and range |
| Start Challenge | Start today’s challenge | Count-in or play screen for that challenge, not Quick Play |
| Quick Play | Quick Play screen | Quick Play, not trail |
| Sky Trail | Level map | Trail with numbered levels |
| Trophies | Trophy case | Trophy list; Back returns home |

**Instrument picker**

Selecting an instrument must change written range and the notes later asked. Back without selecting must not silently change the horn.

**Quick Play / Options**

Walk every setting that is a button, stepper, or toggle (goal length, scale vs single note, character if present). Each one must change its own label. Start from Quick Play must use those settings (the first target matches the chosen written note/range).

**Trail**

Open a locked vs unlocked level. Locked must not start a run, or must show why. Unlocked Play starts that level, not daily.

**During play**

| Control | Intended action | Confirm |
|---|---|---|
| Pause | Pause | Overlay; hold time frozen |
| Skip Rest | End rest early | Next target appears |
| Retry (note result) | Same note again | Same written/concert labels |
| Continue | Next note | Target index advances |
| Stop | Leave the run | Home or results, not a frozen scene |

Confirm auto hold: the pitch strip moves to center, “In tune” / balanced time counts up, the note can complete. A hold that is too short should not count as a full goal.

**Results / trophies**

Play again vs Back must match labels. Trophy screen is read-only unless a control says otherwise.

### Learn Your Instrument

**Setup**

| Control | Intended action | Confirm |
|---|---|---|
| Play / Start | Begin the selected lesson | Play screen asks the first note of that lesson |
| Lesson goals | Select that lesson | Selected goal is highlighted; start uses it (note count / order changes) |
| Instrument picker | Change horn | Fingering chart and written pitch follow the instrument |
| More options | Show/hide extra setup | Panel toggles |
| Mic retry (if shown) | Reconnect mic | In QA mode this is optional; do not fail the run solely for no hardware mic |

**During the lesson**

| Control | Intended action | Confirm |
|---|---|---|
| Back to setup | Setup, progress of this run discarded or clearly kept | Setup title; not plaza |
| Previous note | Earlier note in the lesson | Disabled on the first note; otherwise the staff/fingering go back |
| Next note | Later note without requiring a play | Disabled on the last note; otherwise the staff/fingering advance |
| Hold-to-play (QA) | Register the written note | Hold meter fills; status becomes correct; lesson progress ticks |

**Complete**

| Control | Intended action | Confirm |
|---|---|---|
| Play again | Same instrument and lesson | First note of that lesson |
| Pick another instrument | Setup | Instrument grid |
| Back to games | Plaza | Plaza |

Complete at least one short lesson with auto pitch. Confirm “You played them all” only after every note in that lesson registered, not after opening the screen.

---

## Multitrack

Entry: QA **Multitrack**, or Camera mode → long-press settings wheel → **Multitrack**.

Seeded takes should already sit in boxes. If boxes are empty, tap a tile → **Take Vault** and pick `QA Melody` / `QA Harmony` / `QA Bass`. The picker must list **video** takes only (audio belongs in Backing Track).

### Header and mix strip

| Control | Intended action | Confirm |
|---|---|---|
| Back (Return to Camera Mode) | Close Multitrack | Camera/tools, not a stuck overlay |
| Export | Export sheet (share / save to vault) | Sheet opens; on web, unsupported export must say so — not a silent fail |
| Click on/off | Metronome click for the project | Chip state matches; Play all with click on vs off is different |
| Pitch on/off | Pitch overlay | Overlay appears/disappears on the canvas |
| Backing chip | Backing track sheet | Can set none / audio file / YouTube according to the sheet |
| Music / photo / PDF | Add or edit sheet-music panel | File picker or visual editor; canvas shows the image when one is chosen |

### Transport

| Control | Intended action | Confirm |
|---|---|---|
| Play all | Play every assigned take together | Button becomes Pause; time advances; tiles play in sync |
| Pause | Stop playback | Time frozen; Play all label returns |
| Restart | Return to the start and play/pause per control | Time near zero |
| Scrubber | Seek | Current time label matches the thumb |
| Layout glyphs (1–9 boxes) | Change grid | Box count matches the glyph; existing takes stay in their slots when the grid grows |

### Tile sheet (tap a box)

| Control | Intended action | Confirm |
|---|---|---|
| Record / Record again | Arm recording into that box | Recording stage / count-in. On web without a camera, a clear error — not a black freeze. Do not treat missing hardware as a product bug unless the UI claims the camera is ready. |
| Take Vault | Pick an existing video take | Picker; choosing a take puts it on that tile and closes |
| Music / photo / PDF (empty tile) | Add notation image | Picker or editor |
| Editor | Timeline editor | Align stage, not mixer |
| Remove from tile | Clear the take from the box, keep it in the vault | Box empty; take still in Take Vault |
| Delete take | Confirm, then delete from vault too | Cancel keeps it; confirm removes from tile and vault |
| Mute / volume (mixer or tile) | Affect only that tile | Other tiles still audible/visible as before |

### Mixer sheet

Every slider and mute must bind to the tile whose name is shown. Closing mixer keeps the values. Reset/unity if present must match its label.

### Editor (align stage)

| Control | Intended action | Confirm |
|---|---|---|
| Close / Cancel | Leave without saving pending trims if that is the contract | Confirm whether Cancel reverts; if it saves anyway, that is a bug |
| Done / Save | Persist trims, offsets, section windows | Reopen editor; values stuck |
| Preview | Play the mix from the editor | Transport plays; second tap pauses if labeled as a toggle |
| Add box | New empty box or grow the grid | One more performance box |
| Zoom | Timeline scale | Clips get wider/narrower |
| Trim handles | Change clip in/out | Waveform window changes; Play all respects trim |
| Section window | Box only occupies part of the song | Grid reflow outside the window |
| Add/move/remove image cues | Sheet music timeline | Images cut in at the stated times |

### Recording stage (if the camera path is reachable)

| Control | Intended action | Confirm |
|---|---|---|
| Record / Stop | Start and stop capture | Elapsed time; Stop ends the take |
| Takes | Vault picker for this box | Same as Take Vault |
| Count-in | Count-in settings | BPM / bars change the next record, not a random other setting |
| Retry | Discard and record again | Previous pending take gone |
| Preview | Play the take just recorded | Audible/visible playback |
| Keep | Place take on the tile | Tile shows the take; stage closes |

Export to vault vs share: labels must not swap. Web may correctly refuse native-only export with an explanation.

---

## Out of scope (do not fail the run)

- Real trumpet intonation, native AVFoundation quality, Control Center widgets
- Record/Stop failing because this cloud browser has no camera/mic — fail only if the UI claims it succeeded or offers no error
- Product ideas (“add a coach”, “rename this”)

## Done when

- Plaza, all three games (setup + a real scoring run + results + back), and Multitrack (layout, play all, mute, vault assign, mixer, editor, export attempt) have been walked
- Every labeled control on those surfaces was tapped or explicitly marked disabled-with-reason
- Bugs are filed with intended vs actual for the label
