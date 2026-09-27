// Creates a separate native QA app from the current working tree and built dist.
// Does not change the release Xcode project or the user's installed library.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const destination = path.join(root, 'scripts/practice-qa/results/native-workspace')
if (fs.existsSync(destination)) throw new Error('Native QA workspace already exists; use it or archive it before preparing another.')
if (!fs.existsSync(path.join(root, 'dist/index.html'))) throw new Error('Build the current web app first.')
fs.mkdirSync(path.join(destination, 'scripts'), { recursive: true })
fs.cpSync(path.join(root, 'ios'), path.join(destination, 'ios'), { recursive: true })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(destination, 'node_modules'), 'dir')
for (const name of ['patch-ios-audio-plugin.mjs', 'upload-sentry-dsyms.sh']) {
  fs.copyFileSync(path.join(root, 'scripts', name), path.join(destination, 'scripts', name))
}
function isolate(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['Pods', 'public', 'xcuserdata', '.git'].includes(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) isolate(file)
    else if (/\.(swift|m|plist|entitlements|pbxproj|json)$/.test(entry.name)) {
      fs.writeFileSync(file, fs.readFileSync(file, 'utf8')
        .replaceAll('com.besttake.app', 'com.besttake.app.practiceqa')
        .replaceAll('besttake://', 'besttake-qa://'))
    }
  }
}
isolate(path.join(destination, 'ios'))
const app = path.join(destination, 'ios/App/App')
const plistPath = path.join(app, 'Info.plist')
fs.writeFileSync(plistPath, fs.readFileSync(plistPath, 'utf8')
  .replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]+/, '$1BestTake QA')
  .replace('<string>besttake</string>', '<string>besttake-qa</string>')
  .replace(/(<key>LSSupportsOpeningDocumentsInPlace<\/key>\s*)<false\s*\/>/, '$1<true/>')
  .replace(/<\/dict>\s*<\/plist>\s*$/, '<key>UIFileSharingEnabled</key><true/>\n</dict>\n</plist>\n'))
fs.rmSync(path.join(app, 'public'), { recursive: true, force: true })
fs.cpSync(path.join(root, 'dist'), path.join(app, 'public'), { recursive: true })
const configPath = path.join(app, 'capacitor.config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
config.appName = 'BestTake QA'
fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
const patched = spawnSync(process.execPath, [path.join(destination, 'scripts/patch-ios-audio-plugin.mjs')], { stdio: 'inherit' })
if (patched.status !== 0) process.exit(patched.status ?? 1)
console.log(destination)
