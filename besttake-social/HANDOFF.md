# BestTake — product and social media handoff to Claude

Prepared November 19, 2026, for the founder. This brief consolidates the owner's product decisions, the current repository, and the public App Store listing. It gives Claude the context to develop BestTake's social presence without requiring James to explain the app again.

## Assignment and working relationship

James is handing BestTake's social media work to Claude. Understand the musician's actual workflow, produce useful demonstrations, explain the value clearly, and help people discover and use the app.

No social account handles, platform priorities, audience metrics, posting cadence, advertising budget, or credentials were supplied in this conversation. Obtain those from James and the connected accounts. Follow the publishing/account-management authorization he gives you. This document supplies product context; it does not establish access to an account.

James prefers practical execution, simple explanations, and short progress updates. He repeatedly asks agents to implement and test rather than only propose. Make progress with available information. Ask for missing information when it materially changes the work. Report concrete blockers without repeatedly asking for generic confirmation.

## What BestTake is

**BestTake is a practice room on an iPhone or iPad, built around recording yourself, listening back, comparing attempts, and trying again.** It brings together audio/video recording, sheet music, a tuner, metronome, drone, reference recordings, routines, pitch history, instrument-controlled games, and multitrack recording.

The familiar problem is that everyone tells musicians to record themselves, but doing it consistently with a general-purpose camera or voice recorder takes effort. They switch apps, hunt through recordings, forget which attempt was better, and juggle devices for scores and reference audio. BestTake keeps that context together.

A short explanation:

> Record, listen, compare, and practice again—with your music and tools close at hand.

A longer explanation:

> BestTake helps musicians record audio or video, compare attempts, and keep practice organized. Open a score, bring up a tuner or metronome, load a reference, and work on the piece without repeatedly rebuilding your setup.

“Your practice room” is the broad identity. “Record. Listen. Repeat.” is established messaging. “Practice recorder” explains the entry point. The feature list should support that simple story.

### Public listing verified November 19

Apple's public U.S. lookup returned:

- Current name — **BestTake Practice Room**.
- App ID — **6786522172**.
- Current version — **4.2.3**, released November 16, 2026.
- Download price — **Free**.
- Minimum listed OS — **iOS 15.0**. Specific system integrations can require later versions.
- Public URL — https://apps.apple.com/us/app/besttake-practice-room/id6786522172

Earlier materials use “BestTake: Your Practice Room” and “BestTake: Practice Recorder.” Treat those as historical names/drafts. Use BestTake conversationally and the current listing name where exact naming matters.

The product is developed for iPhone and iPad. A newer commit improves Windows compatibility for the development checkout. That does not establish a released Windows app. Android, public browser, native Mac, or Windows distribution needs separate verification before promotion.

## Founder story and values

The public listing identifies **James as the solo developer**. Earlier positioning describes BestTake as built by a trumpet player frustrated with the record-and-review process. His decisions show attention to musicians holding instruments, reading from a stand, and needing tools within reach.

Confirm career details, credentials, affiliations, anecdotes, and quotations with James before presenting them as biography. Do not invent endorsements or an origin story.

Recurring product values:

- Keep musicians playing, with fewer menu trips and less repeated setup.
- Make listening back convenient enough to become a practice habit.
- Keep the score readable. Music opens as paper, with controls available when needed.
- Remember context. A piece should retain its reference and setup.
- Keep organization simple. A setlist orders pieces; a routine organizes practice activities.
- Make widgets accessible without filling the screen with every possible tool.
- Treat paid workflows seriously. James repeatedly requested vigorous testing because customers pay for Plus.
- Offer substantial core functionality for free.

The intended feel is polished, premium, calm, readable, and approachable. Games can be playful while the main identity remains musical practice.

## Audience and positioning

These are recommended segments inferred from the product, not measured demographics.

| Audience | Recognizable need | Demonstration |
| --- | --- | --- |
| Students | A teacher says record yourself, but recordings get lost | Two takes, comparison, favorite |
| Advanced students and serious amateurs | Work on an excerpt over several sessions | Score, reference, attempts together |
| Teachers | Help students listen and follow a plan | Shared routine and student-selected take |
| Ensemble players | Organize music for rehearsals or concerts | Ordered setlist and piece navigation |
| Players working on intonation | Notice recurring pitch tendencies | Drone, tuner, named pitch history |
| Musicians making layered performances | Hear multiple parts played by one person | Record parts and play them together |

Trumpet/brass is credible early storytelling territory. Keep the broader brand open to other musicians. Demonstrate supported instrument setups rather than claiming every pitch-dependent feature works equally well with every instrument or chord.

## Strongest selling points

### Make recording yourself part of practice

Capture audio or video, listen, compare, choose a keeper, and try again. The immediate benefit is a shorter distance between playing and hearing what happened. Show audible examples rather than a montage of menus.

### Practice from the score with tools beside it

PDF/photo music, tuner, metronome, drone, references, and recording controls can coexist. The benefit is less interruption. “Less switching between your score and your tools” is useful positioning. Avoid universal promises that it replaces every device/app a musician owns.

### Keep the instrument in your hands

Plus supports hands-free play → record → listen-back → repeat. Show the real ready, recording, replay, and next-attempt states. Do not promise perfect detection in every acoustic environment or imply silence settings never need adjustment.

### Return to the piece with its reference ready

A music file remembers its loaded reference. Another piece recalls its own. Turning a page stays within the same piece. This is a clear continuity benefit with a simple screen demonstration.

### Notice pitch patterns over time

Pitch Insights shows held-note history and tendencies. Named instruments keep histories distinct even when instruments share the same key. Position it as guidance for practice and listening, not a complete measure of musical quality.

### Plan a session or organize repertoire

Routines assemble exercises and their tools. Setlists provide a simpler ordered collection of pieces. Both reduce setup friction, with different purposes.

### Useful free core, one-time Plus

Manual recording, playback, comparison, essential tools, one routine, two multitrack boxes, and several games are free. The public listing describes Plus as a one-time purchase with no monthly fee.

## Feature reference

### Recording, take review, and Take Vault

Audio and video recording are supported. Takes stay together for playback/comparison, choosing a Best Take, leaving notes, sharing, and export. Practice items/excerpts supply context around recordings. Focused practice has attempts across sittings, intentions/reflections, and a project journal. Personal ratings are the musician's notes, not automated performance grades.

Current policy imposes no local take-count limit. Device storage still limits how much a person can keep. Avoid “unlimited storage.”

The social story is hearing a difference between attempts. Let a viewer hear both attempts at a fair, comparable volume.

### Music Library and reader — Plus

Import PDFs and supported photos/images. Organize scores with folders, search, and ordering. Select several scores to create a routine or setlist. Scores open in a clean reading view.

Tap the center area to reveal/hide controls. The outer left/right thirds turn pages. James deliberately requested larger page-turn areas for use on a stand. Page controls and markup have separate compact menus. Markup supports pen choices, erasing, undo/redo, remembered pen settings, automatic mark saving, and marked-PDF export. Reading controls include fit/zoom and half-page turns. Opening PDFs through the system Files/share workflow is implemented.

Historical planning documents say annotation or the library should not exist. Those instructions were superseded by later owner decisions and implementation.

### Workspace and the side rail

The final approved interaction from this conversation is:

1. Workspace opens a compact chooser near its button.
2. Users can select **several tools before closing Workspace**.
3. Each chosen widget opens directly on screen.
4. Collapsing a widget sends it to the existing dock/side rail where supported.
5. The rail holds enabled/used tools and relevant session controls.
6. Workspace closes through its button, outside interaction, or Escape.

James rejected the wide menu that expanded across the rail. He wanted the older compact chooser connected to the existing widget dock. There is no hard limit on selected widgets. A saved reference or running routine may also have a dock control. Phone and iPad arrangements differ, so film the actual device.

### Per-piece references — Plus

James initially considered a “Save to this piece” button, then explicitly removed that extra step. **Loading the reference should remember it automatically.**

Open Workspace → References from the score reader, then load an audio file or YouTube link. The music file remembers the selection. Returning to the piece restores it. Moving to another file, including the next setlist piece, recalls that piece's reference. **Turning a page within one PDF does not change recordings.**

Replacing a reference uses the latest choice. Removal should persist. A delayed audio upload remains attached to its original piece and cannot interrupt the next piece's playback. Restored media waits for a Play tap. References can also be configured through the score's Library Tools and in routines.

YouTube playback remains subject to video availability and embedding restrictions. YouTube reference audio is excluded from multitrack exports. Do not advertise ripping, downloading, offline-saving, or exporting YouTube recordings.

### Setlists

A setlist puts pieces in order for rehearsal or performance. James explicitly asked that this stay simple. It navigates between pieces and supports repeated occurrences of one score. A ten-page PDF is still one file. A setlist changes files/entries rather than individual pages.

Current source caps lists at 100 entries. That is generally an internal detail, not a headline. No cloud-collaboration or automatic page-turn service has been established for setlists.

### Routines and focused practice

Routines organize exercises and their tools. Instrument-aware suggestions, custom exercises, timing, saved setups, references, progress, and sharing/import workflows exist. Compact running controls let users move through a session.

Explain the distinction simply:

- **Setlist** — these pieces in this order.
- **Routine** — these exercises with the tools/setup needed for each.

One authored saved routine is free. Plus permits unlimited saved routines. Shared routines can open for free, with attached Plus content requiring Plus. Sharing a routine is a handoff, not continuous synchronization of accounts or libraries.

There is also a programmable practice/metronome program system with sections, tempos, meter, count-ins, and related timing. Explain what the visible interface does instead of teaching users the internal difference between routine engines.

Focused practice keeps an excerpt and attempts together across sittings. Users can review earlier attempts, notes, and comparison baselines. Routine tool settings and standalone score settings have separate ownership so one workflow does not silently rewrite the other.

### Tuner and drone

The live tuner and tuning drone are free. Transposition uses keys/note names rather than lists of repeated instrument labels. Current sensitivity uses a three-stop slider labeled **Smooth, Balanced, Responsive**, backed by existing detector profiles.

Instrument key and instrument identity are separate. James specifically wanted C trumpet and flute to share an appropriate transposition while keeping different named histories.

Describe the tuner as a practice aid. Avoid unsupported claims about exact accuracy, zero latency, chord recognition, clinical measurement, or professional certification.

### Pitch Insights — Plus

Pitch Insights displays held-note history, sharp/flat tendencies, and changes over time. Users can create named instrument profiles and choose their key. Earlier unnamed readings appear under **Default**.

Saving can be switched on/off. The live tuner offers a pause/clear decision when rapidly changing pitch activity may be unsuitable for the player's personal history, such as playing with others. Capture respects the saving preference.

Use examples like “notice which notes tend flat” or “keep flute and C trumpet history separate.” Avoid treating pitch history as a diagnosis, an ensemble-analysis engine, or proof of overall musical improvement.

### Metronome and system shortcuts

The free metronome includes tempo, meter, subdivision, and advanced program controls. Quick Tuner and Quick Metronome have system shortcut/control integrations whose availability depends on OS and surface.

The app icon's long-press menu includes **Continue Music** in current source. It reopens the last score or precise setlist occurrence, with fallbacks to an available piece/the library. Native cold/warm delivery was checked. A physical Home Screen interaction should be verified in the build being filmed.

### Multitrack

Record parts separately and play them together. The public listing advertises two boxes free and up to twelve with Plus. Source includes additional timed boxes and advanced editing, but use the public twelve-part statement unless James approves and demonstrates something more specific.

Capabilities include layouts, independent timing/trim/mix, arrangement/size controls, saved projects, and portrait/landscape/square video export. Imported backing audio can be included. YouTube references are excluded.

Previous audits left hardware audio timing, Bluetooth behavior, and some long/export workflows for device testing. Do not claim perfect synchronization on every setup or unlimited tracks.

### Games and daily challenges

Games use the player's instrument/microphone input:

- **Learn** — match written notes and supported instrument fingering guidance, one note at a time.
- **Balance** — sustain the shown pitch in tune to keep the character moving.
- **Staff Jumper** — read/play notes to progress across the staff. Easy is free; Medium/Hard require Plus.

Learn and Balance, including earned characters, are free. Games are labeled Beta in the current tool interface.

Daily practice/game challenges award local trophies and character unlocks. Progress is device-local. There is no established public competitive leaderboard or cash/redeemable reward system. Demonstrate actual available characters rather than promising unverified rewards.

### Navigation and refinement

Recent work adds a Recording return from the tool tabs and Music Library, going back to the Camera or Audio recorder the musician left. Games also have a return path. Guards protect recording/saving transitions.

James wants polished, readable menus and predictable movement. “Bugless,” “never crashes,” and “works perfectly every time” go beyond the testing evidence.

## Free and Plus boundaries

| Free or free allowance | Plus |
| --- | --- |
| Manual audio/video recording | Hands-free record/listen/repeat |
| Playback, Best Take, compare, notes, sharing/export | Music Library, score reading/markup |
| Tuner, metronome, drone | Imported backing audio and YouTube references |
| One authored saved routine | Unlimited saved routines |
| Two multitrack boxes | Additional boxes, publicly advertised up to twelve |
| Learn, Balance, Easy Staff Jumper | Medium and Hard Staff Jumper |
| Existing recordings remain accessible | Pitch Insights |

The owner-approved U.S. lifetime price was **$9.99 once**, confirmed in earlier setup. The current public description confirms one payment/no monthly fee, but the live IAP price was not independently rechecked November 19. Verify the storefront/paywall before publishing a price-led campaign. Apple supplies localized prices.

Eligible users may explicitly choose a seven-day trial through Apple. It does not renew or charge automatically. A free download does not automatically grant Plus. Family Sharing was last documented off for the replacement product; verify before advertising it.

Plus expiry retains saved work and the free capabilities/permitted retrieval paths. Do not recommend deleting/reinstalling as a casual troubleshooting step because device-local material can be lost.

James asked for friend codes. These should use Apple's official free offers for the lifetime product. No usable customer codes were generated or verified in this conversation. Do not invent a promo code, advertise an expired internal TestFlight unlock, or announce a giveaway without actual codes.

## Privacy, local storage, and sync

A useful short statement is:

> Your recordings and practice material stay on your device unless you choose to share them. No BestTake account is required.

The current privacy source, effective November 16, also describes external services:

- Recordings, scores/markings, routines, practice history, pitch-reading numbers, and game progress are local.
- Sentry receives technical crash/performance diagnostics.
- The November 16 repository commit adds optional HeyCatch screen/onboarding/confirmed Plus transaction analytics. Source consent defaults off until enabled.
- Current policy excludes recordings, music, practice history, and payment details from those analytics events.
- YouTube search/playback uses external services. Embedded YouTube may include non-personalized ads.
- Optional dictated notes use Apple's speech-recognition service.
- Takes are excluded from iCloud device backup by default, with an optional Include Takes in iCloud Backup setting.
- Apple handles purchases and code redemption.

There is no established BestTake account-based library sync between iPhone and iPad. Device backup, routine sharing, and purchase restoration have different purposes. An earlier request to audit account sync does not establish that the feature exists.

Avoid blanket claims of “nothing ever leaves your phone,” “ad-free,” “zero analytics,” “entirely offline,” or “automatic cross-device sync.” Describe the specific feature and refer privacy questions to the current policy.

## Release check before filming

The public U.S. listing reports 4.2.3 live. Before filming or announcing a specific feature, confirm the installed public/TestFlight version and build with James, and film the build customers actually get. Do not present a test preview as proof of a working live purchase or public release. Internal release, review and debugging history is private operating context, not a social talking point. Confirm current behavior before describing any feature as fixed or new.

## Voice and creative direction

Recommended direction based on James's preferences:

- Sound like a musician demonstrating a useful workflow to another musician.
- Start with a recognizable problem, an action, or an audible musical result.
- Use labels like piece, score, take, reference, routine, and setlist consistently.
- Keep explanations concrete and easy to follow while holding an instrument.
- Let real playing/playback substantiate the claim.
- Use a founder voice when James supplies or approves the personal story.
- Humor can address practice friction without shaming beginners or musicians struggling with pitch.
- Prefer “hear what changed” to promises of instant improvement.

Visuals should keep the score and controls readable. Use the current app UI. Dense feature montages with tiny captions undermine the stand-friendly product. Reveal tools when they become relevant to the demonstration.

forScore was a reading/annotation usability reference during development. Do not claim affiliation, endorsement, integration, legal clearance, or that BestTake reproduces its entire feature set. James's earlier “Foursquare” mention appears to refer to forScore in context, but avoid building a public comparison around that ambiguity.

## Suggested content strategy

The recommendations below are starting points for James to refine, not previously approved campaign commitments.

### Content pillars

1. **Record and listen** — compare two attempts and one concrete adjustment.
2. **The music stand** — score, reference, and tools together.
3. **Hands-free practice** — a real recording/listen-back cycle.
4. **Organized practice** — routines and simple rehearsal setlists.
5. **Pitch patterns** — tuner, drone, and named history.
6. **Play every part** — short multitrack performances.
7. **Built by a musician** — James explaining product choices and feedback.
8. **Play to learn** — instrument-controlled games and challenges.

Start with useful demonstrations and musician problems, then mix in founder updates and direct Plus promotion. Establish cadence from available footage and account evidence rather than inventing a daily-posting requirement.

Short vertical demos suit Reels, TikTok, and Shorts. Carousels can explain a workflow or free/Plus boundaries. Longer demos can help teachers/advanced users. Choose actual platforms after inspecting James's accounts.

### Demonstration structure

Open with a practice problem or musical result. Show one complete action. Make the benefit audible/visible. End with one relevant next action. Caption speech and keep text within platform-safe areas.

When comparing performances, use fair listening levels. Do not manufacture improvement through selective processing. Clearly identify a Plus workflow when the demonstrated feature requires it.

### Starter content queue

| Topic | Shot sequence | Benefit |
| --- | --- | --- |
| “Your teacher says record yourself” | Record two takes, compare, choose a keeper | Make listening practical |
| Same passage, one adjustment | First attempt, adjustment, second attempt | Hear a specific change |
| Put the phone down | Hands-free ready → play → replay → ready | Stay in playing position |
| Each piece remembers | Piece A → piece B → A with different references | Less repeated setup |
| Pages versus pieces | Turn PDF page, then advance setlist entry | References follow files |
| A clean score | Open paper, reveal controls, launch Metronome | Tools when needed |
| Choose several tools | Select Metronome, Drone, References in Workspace | One setup pass |
| Rehearsal order | Select scores, create list, open next piece | Organized repertoire |
| Short practice plan | Three routine exercises with tool setups | Spend less time configuring |
| Same key, different instruments | C trumpet and flute profiles | Distinct pitch histories |
| A note worth reviewing | Genuine pitch trend and a drone exercise | Turn a pattern into practice |
| Play a duet yourself | First part, second part, combined playback | Layered music-making |
| Play with your instrument | Audible input controls Balance/Staff Jumper | Playful practice |
| What's free? | Recorder, tuner, metronome, two parts | Useful free core |
| Why Workspace changed | James explains compact chooser and selective rail | Feedback shapes the app |

## Draft scripts and captions

These are working examples, not words James has already published. Validate the visible UI on the build used for filming. Use first person only when the post is intended to speak as James.

### Video 1 — record and compare, about 20 seconds

**Opening text:** “You recorded it. Did you listen back?”

1. Play a short passage and stop recording.
2. Play another attempt and show both takes.
3. Listen to the same moment from each. Caption an actual difference, such as a cleaner entrance, only when the audio supports it.
4. End with “Record. Listen. Try again. BestTake.”

**Caption:** “A second take is more useful when you can hear what changed. BestTake keeps your attempts together so listening back fits into practice. Free on iPhone and iPad, with optional BestTake Plus.”

### Video 2 — references for each piece, about 20–25 seconds

**Opening text:** “Your next piece has a different reference recording.”

1. Open a score and load an audio reference.
2. Move to another piece and show its different saved reference.
3. Return to the first score and show its recording ready to play.
4. End with “Your piece. Its reference. Ready next time.”

**Caption:** “Load a reference while working on a piece, and BestTake remembers it for that music file. Open another piece and its own reference comes back. Part of BestTake Plus.”

### Video 3 — hands free, about 20–30 seconds

**Opening text:** “Keep your instrument in your hands.”

1. Show the phone/tablet on a stand and the real hands-free ready state.
2. Play and let the take stop through the configured silence behavior.
3. Show/listen to replay and the next ready state.
4. End with “Play. Hear it back. Go again.”

**Caption:** “Less reaching for the screen between attempts. BestTake Plus brings hands-free recording and listen-back into your practice session.”

### Video 4 — setlist, about 15 seconds

**Opening text:** “Put rehearsal in order.”

1. Select scores in the library.
2. Create/reorder the setlist.
3. Open the first piece and move to the next.

**Caption:** “A setlist for the music you need, in the order you need it. Keep your rehearsal pieces together in BestTake Plus.”

### Other caption starters

- “Your score is open. Your click is ready. Your last take is right there. Practice with the tools around the music.”
- “C trumpet and flute share a key. Name your instruments and keep their Pitch Insights histories separate.”
- “A routine is your practice plan. A setlist is your pieces in order. BestTake gives each one a simple job.”
- “Two parts, one player. Start with two multitrack boxes free in BestTake.”
- “Tuner, metronome, drone, and manual recording are free. Plus adds more of the practice room with a one-time purchase.”
- “Which tool do you reach for most while reading music? I'm working on keeping it close without covering the score.”

Use one CTA appropriate to each post—download, try the workflow, save the tip, or answer a genuine question. Avoid piling every CTA onto every caption.

## Community replies and support

**“Is it free?”**

“BestTake is free to download. Recording, playback, tuner, metronome, drone, one saved routine, two multitrack boxes, Learn, Balance, and Easy Staff Jumper are free. Plus adds sheet music, references, hands-free recording, Pitch Insights, and more.”

**“Is Plus a subscription?”**

“Plus is a one-time purchase with no monthly fee. The app shows your regional price. Eligible users can choose a seven-day trial that doesn't renew or charge automatically.”

**“Are my recordings uploaded?”**

“Your recordings stay on your device unless you choose to share them. No BestTake account is required. The privacy policy explains diagnostics, optional analytics, and online reference features.”

**“Will my music sync to my other device?”**

“Music, routines, and recordings are stored on each device. Supported sharing is available, but an automatic BestTake account-sync service isn't currently established.”

**“Why won't YouTube play?”**

“Some videos restrict embedded playback. Try another reference or an audio file you have permission to use. If it keeps happening, send your app version, device model, and the steps to support.”

**“The purchase buttons are disabled.”**

Ask for version/build and installation source—App Store, TestFlight, or development build. Apple must return the purchase options for the buttons to work. Avoid promising that a reset fixes it or sending people to an outside payment method. Escalate with concrete details.

**“I found a bug.”**

Thank them for the report. Ask for device, iOS version, BestTake version/build, what they tapped, and what happened. Direct them to the report link under Settings/Help or the contact on the support page. Let them decide whether to send a recording. Give a fix date only after engineering confirms it.

**“Can I get a code?”**

Check with James for an actual Apple-issued offer campaign and remaining codes. Use its verified redemption instructions. Never generate plausible-looking strings or reuse an internal testing shortcut.

Do not claim to have issued a refund, fixed an account, restored a purchase, read a private message, or changed a release unless the action was actually performed and verified through authorized tools.

## Social operations and measurement

Inspect accounts or ask James for handles, priority platforms, current audience, and the desired outcome. Possible goals include downloads, active practice, Plus conversion, or teacher adoption. No goal hierarchy has been approved in this handoff.

Measure what the connected services actually provide—retention/watch time, saves, shares, meaningful comments, profile/link activity, and attributable installs/purchases where reliable attribution exists. Keep estimates separate from observed numbers. Optional HeyCatch analytics does not automatically establish social attribution.

Test a few repeatable creative approaches. Compare an immediately audible result with a recognizable problem as the opening. Compare James on camera with a screen-led demo. Document the actual creative difference so James can understand why a format is repeated or dropped. Do not invent testimonials, statistics, user counts, or before/after results.

Use authentic engagement. Do not manufacture ad views, reviews, customers, comments, or social proof.

Use music, scores, clips, and testimonials James has permission to publish. A YouTube embed inside the app does not provide rights for a social edit. Ask about specific assets when ownership/permission is unclear. Do not imply a professional performer, school, publisher, or association endorses BestTake because its repertoire or name appears in a reference.

## Links and assets

### Public links

| Purpose | Address |
| --- | --- |
| App Store | https://apps.apple.com/us/app/besttake-practice-room/id6786522172 |
| Support page | https://besttake-share.netlify.app/support.html |
| Listing privacy link | https://besttake-share.netlify.app/privacy |
| In-app privacy source link | https://stalwart-salamander-9451ab.netlify.app/privacy.html |
| Routine-sharing site | https://besttake-share.netlify.app/ |

The support page and listing privacy link returned HTTP 200 on November 19. Multiple Netlify addresses exist because sharing, hosted playback, and metadata evolved separately. James was previously unsure which address served which purpose. Use verified public links and do not invent a custom domain.

### Local assets

These live in the app repository on the founder's Mac; ask for the files rather than assuming a path.

| Path relative to repository | What it contains |
| --- | --- |
| `release-review/ad/besttake-ad-10s.mp4` | Existing approximately 10-second ad export; inspect before reuse |
| `release-review/ad/compose/` | Ad composition and timeline files |
| `release-review/ad/footage/` | Screen footage/stills and generated frames |
| `release-review/ad/capture/` | Capture fixture with synthetic camera/audio and seeded pitch history |
| `release-review/app-store-4.2/raw/` | Older phone/tablet screenshots for recording, Music, routines, tuner, metronome, games, multitrack |
| `build/music-workspace-compact/menu-390.png` and `menu-834.png` | Compact Workspace previews if still present |
| `src/assets/practice-characters/` | Character art and related art direction |

The ad directory is currently untracked in Git. Generated build folders may be cleaned. A filename or a successful render is not proof that James approved an ad.

Capture fixtures intentionally generate stand-in media and pitch data. They may illustrate the interface, but they do not show a real customer's improvement. Do not turn seeded charts into testimonials or measured outcomes. Replace old controls in tutorials with footage from the intended release.

### Sources for follow-up questions

- `src/plus/plusPolicy.ts` and `src/plus/PlusPaywall.tsx` — feature caps and current purchase-facing language.
- `src/utils/musicLibrary.ts` and `src/App.tsx` — per-score setup/references and navigation.
- `src/utils/musicSetlists.ts` — setlists.
- `src/components/PracticeChartLayer.tsx` — clean reading, markup, Workspace.
- `src/components/MusicWidgetDrawer.tsx` — rail behavior.
- `src/utils/recentMusic.ts` — Continue Music.
- `src/components/audioPractice/PitchInsightsScreen.tsx` — named instrument histories.
- `src/components/audioPractice/TunerSensitivityControl.tsx` — actual sensitivity labels.
- `src/utils/privacyPolicy.ts` — current policy source, rendered in app and into the hosted page.
- `src/utils/heyCatch.ts` and `ios/App/App/HeyCatchPlugin.swift` — optional analytics.
- `BESTTAKE_PLUS.md`, `FOCUSED_PRACTICE.md`, `DAILY_CHALLENGES.md`, `MULTITRACK_UPGRADE.md` — context with historical caveats.
- `release-review/app-store-4.2/listing.md` — useful copy with a stale version heading.

Never transfer credentials, analytics tokens, signing information, private diagnostics, or users' recordings into public content or shared marketing material.

## Decisions, recommendations, and open inputs

### Established owner decisions

Clean score-first reading. Larger page-turn areas. Page and markup controls with different jobs. Compact Workspace with multiple selections. Widgets opening directly, then collapsing into a selective rail. Simple ordered setlists. References automatically remembered per music file. Routines for structured practice. Named pitch histories. One-time Plus. Clear paths back to recording. Workflow testing for paid features.

### Recommendations introduced in this brief

Audience segments, content pillars, scripts/captions, platform roles, and measurement approach are proposed starting points. James has not separately approved a specific campaign, posting calendar, price promotion, or ad budget here.

### Inputs to resolve

- Social handles/access, publishing scope, and platform priorities.
- Audience/goal priorities and available baseline metrics.
- James's preferred first-person voice and verified biography.
- Real playing footage and permission for repertoire/collaborator appearances.
- Installed release/build for demonstrations.
- Current regional Plus price and verified purchase/redemption behavior.
- Actual issued offer codes and campaign conditions.

A useful first deliverable is a small batch of publish-ready posts, each with its platform, caption, on-screen text, footage asset, and CTA. Keep the story grounded in musicians recording, listening, and returning to their music.

## Verification note

This handoff was prepared from the owner conversation and the app repository, plus Apple's public lookup at `https://itunes.apple.com/lookup?id=6786522172&country=us` on November 19, 2026. The lookup supplied the current name/version/free download and public description. It does not establish the live Plus IAP price or every installed-binary behavior. Support/privacy HTTP checks establish link availability, not a deployment-content audit. Recheck time-sensitive claims before publication.
