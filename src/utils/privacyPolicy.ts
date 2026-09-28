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
export const PRIVACY_EFFECTIVE_DATE = 'September 22, 2026'

export interface PrivacySection {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export const PRIVACY_SUMMARY =
  'BestTake has no accounts, no ads, no analytics, and no tracking. Your recordings, music, routines, and practice history stay on your device. The developer never sees them.'

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
      'Crash reports. If the app crashes or hits an error, a technical report is sent to Sentry, the service we use to find and fix bugs. It contains the device model, iOS and app version, and what the app was doing when it failed. It never contains your recordings, sheet music, names, or email address, and file names are removed before it is sent. Reports are not linked to your identity, not used for tracking, and are deleted automatically after a limited period.',
      'YouTube search. When you search for a reference recording, the words you type are sent to BestTake’s search server, which asks YouTube for matching videos. Searches are kept in memory for up to 15 minutes so repeat searches are fast, and are not saved. Your network address is used only briefly to limit how often searches can be made. Our host, Netlify, may keep standard server logs for security.',
      'YouTube playback. Reference videos play in YouTube’s own embedded player, so YouTube (Google) may collect information under Google’s privacy policy while a video is loaded.',
      'Things you choose to send. When you share a take, share a routine, save to Photos, or email a bug report, it goes only where you send it.',
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
