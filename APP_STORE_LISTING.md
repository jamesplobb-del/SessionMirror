# BestTake — App Store Listing Copy

Drafted for the 2.3 launch. Positioning: BestTake is the musician's replacement for
the Camera app and Voice Memos. It captures demand that clinicians and teachers
already create ("record yourself") and that the standard apps then lose.

Character limits are Apple's. Counts are verified in `scripts/check-listing-lengths.mjs`.

---

## App Name — 30 char limit

```
BestTake: Practice Recorder
```

Carries the search term the target user actually types. Rejected `BestTake: Tuner &
Metronome` — higher raw volume, but it attracts commodity shoppers and buries the pitch.

## Subtitle — 30 char limit

```
Stop practicing with 3 devices
```

Alternate, if you want the universal version over the punchy one:

```
Record, compare, improve
```

## Keywords — 100 char limit, comma-separated, no spaces

```
tuner,metronome,intonation,trumpet,band,brass,multitrack,playalong,takes,rehearsal,drone,pitch,sax
```

Apple already indexes the name and subtitle, so `practice`, `recorder`, and `devices`
are deliberately omitted — repeating them wastes the field.

## Promotional Text — 170 char limit

```
Every masterclass says record yourself. Then the camera roll makes it miserable. BestTake keeps every take in one place so you can actually hear what changed.
```

## Description — 4000 char limit

```
Every masterclass tells you the same thing: record yourself.

So you try. You open the camera, play, stop. Then you scroll the camera roll past photos of your lunch to find the take. You listen. You go back. You record again. Ten minutes later you have played twice and you cannot remember which take was better.

BestTake was built by a trumpet player who got tired of that.

TAKE BOXES, NOT A CAMERA ROLL
Every take lands in a box next to the one before it. Play two back to back, mark the keeper, drop a marker on the bar you keep missing. Your takes stay in one place, in order, with the context that makes them worth reviewing.

HANDS-FREE PRACTICE WITH BESTTAKE PLUS
Set the phone down and play. BestTake listens, records, plays your take back, and gets ready for the next one without you touching the screen. The record-listen-repeat loop, with the phone out of your hands and your instrument in them.

ONE DEVICE INSTEAD OF THREE WITH BESTTAKE PLUS
Playing along used to mean a phone to record, a tablet for the music, and a laptop for the backing track. BestTake holds all three. Pull up a PDF or photo of your part, load a backing track or a YouTube play-along, and record over it.

SEE WHETHER YOU ARE ACTUALLY IMPROVING WITH BESTTAKE PLUS
The tuner remembers every note you hold. Pitch Insights shows your median cents by day, your least centered notes, and how both change over weeks, so "am I getting better" stops being a feeling.

BUILT FOR YOUR INSTRUMENT
The tuner transposes. Note names follow your part while cents stay at concert pitch, and detection profiles adapt to what you play.

ALSO INSIDE
- Metronome with time signatures, subdivisions, and a tuning drone
- Programmable practice sessions you can plan, save, and share
- Multitrack layering to record harmony with yourself
- Practice Games: sight-reading and long-tone games you play with your instrument, not your thumbs
- Quick Tuner and Quick Metronome in Control Center

Core recording, playback, tuner, metronome, one saved routine, and two multitrack boxes are free. BestTake Plus unlocks hands-free recording, sheet music and backing tracks, YouTube references, Pitch Insights, more routines and multitrack boxes, and expanded Staff Jumper options. Plus is available through an in-app purchase; an eligible seven-day trial is offered in the app.

Your takes are stored on your device, not uploaded to a server. No account required.
```

---

## Screenshot sequence

Order matters more than polish — most people see only the first two.

1. **Take boxes.** The hero. Two takes side by side, one marked as the keeper.
   Caption: *Your takes, not your camera roll.*
2. **One device instead of three.** Sheet music + backing track + record armed on one
   screen. Caption: *Sheet music and backing tracks with BestTake Plus.*
3. **Hands-free.** Phone on a stand, with the actual "Your turn" state visible.
   Caption: *Hands-free recording with BestTake Plus.*
4. **Pitch Insights.** The multi-week chart. Caption: *See your progress with BestTake Plus.*
5. **Tuner.** Transposition visible. Caption: *A tuner that knows your part.*
6. **Practice Games.** Caption: *Practice that doesn't feel like practice.*
7. **Multitrack.** Caption: *More recording layers with BestTake Plus.*

Required sizes: one 6.9-inch iPhone and one 13-inch iPad. Apple scales down from there.

## Review notes for App Review

```
BestTake records practice sessions for musicians.

Microphone permission is needed to record audio and for sound-driven features such as the tuner and games. Camera permission is needed only for video takes. If either permission is denied, Home, Settings, the metronome, saved takes, and other features that do not need that permission remain available. The app offers a way to open iOS Settings from the recording surface.
Photo library access is requested only when the user explicitly saves a take to Photos.

To test core functionality: grant mic access, tap record on the audio mode home screen,
play or speak for a few seconds, and stop. The take appears in the take box below the
record control and can be played back and compared against a second take.

The Practice Games section requires microphone input to control gameplay (pitch detection).
The YouTube play-along feature loads standard YouTube embeds for user-supplied URLs.

BestTake Plus is an optional in-app purchase. A seven-day trial is offered to eligible users. Plus unlocks hands-free recording, sheet music and backing tracks, YouTube references, Pitch Insights, additional routines and multitrack boxes, and expanded Staff Jumper options. The free app includes recording/playback, tuner, metronome, one saved routine, and two multitrack boxes. The Plus product identifiers are com.besttake.app.plus.lifetime and com.besttake.app.plus.trial7days.
```

## Still needed before submit

- Review the drafted [privacy policy](netlify-youtube-proxy/privacy.html) and [support page](netlify-youtube-proxy/support.html), then deploy them and enter their live URLs in App Store Connect.
- Submit both Plus products with the app version: `com.besttake.app.plus.lifetime` and `com.besttake.app.plus.trial7days`.
- Category: Music. Secondary: Education.
- Age rating questionnaire.
- App Privacy: Diagnostics → Crash Data, not linked to identity, not used for tracking.
- EU DSA trader declaration if shipping to the EU.
