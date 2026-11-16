/**
 * The privacy policy, written once. Settings renders it in-app (it has to work
 * offline), and `scripts/build-privacy-page.mjs` renders the same text to the
 * public page App Store Connect links to. Edit here, then rerun the script.
 *
 * Every sentence has to stay true of the shipped app: when a feature starts
 * sending something off the device, this changes in the same commit.
 */

export const PRIVACY_POLICY_URL = 'https://stalwart-salamander-9451ab.netlify.app/privacy.html'
export const PRIVACY_CONTACT_EMAIL = 'BestTakeSupport@gmail.com'
export const PRIVACY_EFFECTIVE_DATE = 'November 16, 2026'

export interface PrivacySection {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export const PRIVACY_SUMMARY =
  'BestTake has no accounts and does not sell your data or track you across apps. Your recordings, music, routines, and practice history stay on your device unless you choose to share them. Technical diagnostics help us fix bugs. Optional app analytics help us improve BestTake. Optional YouTube references use Google’s privacy-enhanced player and may include non-personalized ads.'

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    title: 'What stays on your device',
    paragraphs: [
      'Everything you make in BestTake is stored in the app on your iPhone or iPad and is never uploaded by BestTake:',
    ],
    bullets: [
      'Audio and video takes, best takes, and take notes',
      'Sheet music PDFs and photos you add, and any markings you draw on them',
      'Routines, practice history, and daily challenge progress',
      'Pitch Insights readings (numbers describing notes you held, never audio)',
      'Game scores, trophies, and characters',
      'Your instrument and settings',
    ],
  },
  {
    title: 'Camera, microphone, and other permissions',
    bullets: [
      'Camera: to record video takes.',
      'Microphone: to record takes and to let the tuner, hands-free recording, and practice games hear you. The tuner and games analyze sound as it happens and do not save it.',
      'Photos: add-only access, used only when you choose to save a take to Photos. BestTake does not read your existing photos or videos.',
      'Speech recognition: used only when you choose to dictate a note. Your speech is transcribed by Apple’s speech recognition service, which may send the audio to Apple under Apple’s privacy policy.',
    ],
  },
  {
    title: 'What leaves your device',
    paragraphs: [
      'A few features need the internet. This is everything that is sent, and why:',
    ],
    bullets: [
      'Technical diagnostics. Crash reports, app-hang and performance information, and other technical diagnostics are sent to Sentry, the service we use to find and fix bugs. It contains the device model, iOS and app version, and what the app was doing when it failed. It never contains your recordings, sheet music, names, or email address, and file names are removed before it is sent. Reports are not linked to your identity, not used for tracking, and are deleted automatically after a limited period.',
      'App analytics. When you turn on Share app analytics, we send HeyCatch screen views, onboarding activity, and confirmed BestTake Plus trial and purchase events to understand how BestTake is used. Events include a random app installation identifier, app and device information, and the network address used to send them. Recordings, music, practice history, and payment details stay out of these events. You can request deletion by contacting BestTake support.',
      'YouTube search. When you search for a reference recording, the words you type are sent to BestTake’s search server, which asks YouTube for matching videos. Search results and their query are cached in memory for up to 15 minutes so repeat searches are fast. We do not maintain a personal search history. Your network address is used only briefly to limit how often searches can be made. Our host, Netlify, may keep standard server logs for security.',
      'YouTube playback. Reference videos use YouTube’s privacy-enhanced embedded player. Google may still collect video and ad interactions, browser or device identifiers, technical information, and your IP address, which can indicate approximate location, under Google’s privacy policy (https://policies.google.com/privacy). Privacy-enhanced mode does not mean no data is collected. Google says these embedded views do not personalize your YouTube browsing experience or ads outside BestTake, and any ads in this player are non-personalized. Leaving the player for YouTube or another website is covered by that service’s own privacy practices.',
      'Things you choose to send. When you share a take, share a routine, save to Photos, or email a bug report, it goes only where you send it.',
      'Routine links. A shared routine link opens a page on BestTake’s website that hands the routine to the app. The routine is stored inside the link itself, after the # sign, which browsers never send to the website, so BestTake never receives it.',
      'iCloud backup. Takes are left out of your device’s iCloud backup unless you turn on “Include Takes in iCloud Backup” in Settings. Backups are handled by Apple.',
      'Purchases and promo codes are handled entirely by Apple. BestTake never receives your payment details.',
    ],
  },
  {
    title: 'Children',
    paragraphs: [
      'BestTake is made for musicians of every age, including students. Because there are no accounts and recordings stay on the device, nobody has to give BestTake any personal information to use it, and BestTake does not knowingly collect personal information from children.',
    ],
  },
  {
    title: 'Your choices',
    bullets: [
      'Delete any take, piece of music, or routine inside the app at any time.',
      'Deleting BestTake removes everything it stored on your device, except anything already in your own backups.',
      'You can turn camera, microphone, photos, and speech recognition access on or off in iOS Settings.',
      'Turn Share app analytics off at any time under Settings → Help → Privacy to stop new analytics events.',
      'You never have to use YouTube search or playback to use BestTake.',
    ],
  },
  {
    title: 'Changes to this policy',
    paragraphs: [
      'If BestTake starts handling information differently, this policy will be updated before that version is released, and the date below will change.',
    ],
  },
]
