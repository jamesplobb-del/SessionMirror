import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ios = join(root, 'ios/App')
const scheme = 'AppInternalPreview'
const configuration = 'InternalPreview'
const team = 'X24D9LKQ58'
const version = '4.2'
const build = '27'
export const previewMarker = 'BESTTAKE_INTERNAL_PLUS_PREVIEW_BUILD_1'
const swiftFlag = 'BESTTAKE_INTERNAL_PLUS_PREVIEW'
const defaultArchive = join(root, `build/internal-plus-preview-${version}-${build}/BestTake-${version}-${build}-InternalPreview.xcarchive`)

export const internalExportOptions = Object.freeze({
  destination: 'upload',
  method: 'app-store-connect',
  signingStyle: 'automatic',
  teamID: team,
  manageAppVersionAndBuildNumber: false,
  testFlightInternalTestingOnly: true,
  uploadSymbols: true,
})

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options })
}

function readPlist(path) {
  return JSON.parse(run('python3', ['-c',
    'import json,plistlib,sys; print(json.dumps(plistlib.load(open(sys.argv[1],"rb")),default=str))', path]))
}

export function validateExportOptions(options) {
  assert.deepEqual(options, internalExportOptions, 'Export options must be the fixed internal-TestFlight-only options')
}

export function validateBundle(info, executable, expectedBundle, internal) {
  assert.equal(info.CFBundleIdentifier, expectedBundle, 'Unexpected bundle identifier')
  assert.equal(info.CFBundleShortVersionString, version, 'Unexpected marketing version')
  assert.equal(info.CFBundleVersion, build, 'Unexpected build number')
  assert.equal(executable.includes(Buffer.from(previewMarker)), internal,
    internal ? 'Archive lacks the compiled internal-preview marker' : 'Normal release contains the internal-preview marker')
}

function buildConfigurations(project, owner) {
  return project.objects[owner.buildConfigurationList].buildConfigurations
    .map(id => project.objects[id])
}

function flags(settings) {
  return `${settings.SWIFT_ACTIVE_COMPILATION_CONDITIONS ?? ''} ${settings.OTHER_SWIFT_FLAGS ?? ''}`
}

function checkConfig() {
  const project = JSON.parse(run('plutil', ['-convert', 'json', '-o', '-', join(ios, 'App.xcodeproj/project.pbxproj')]))
  const owners = [project.objects[project.rootObject], ...Object.values(project.objects).filter(object => object.isa === 'PBXNativeTarget')]
  for (const owner of owners) {
    const configs = buildConfigurations(project, owner)
    for (const name of ['Debug', 'Release', configuration]) {
      const config = configs.find(item => item.name === name)
      assert.ok(config, `${owner.name ?? 'project'} is missing ${name}`)
      const shouldEnable = owner.name === 'App' && name === configuration
      assert.equal(flags(config.buildSettings).includes(swiftFlag), shouldEnable,
        `Preview flag separation failed for ${owner.name ?? 'project'} ${name}`)
      if (owner.isa === 'PBXNativeTarget') {
        assert.equal(String(config.buildSettings.CURRENT_PROJECT_VERSION), build)
        assert.equal(String(config.buildSettings.MARKETING_VERSION), version)
        if (owner.name === 'QuickTunerControl') {
          assert.ok(flags(config.buildSettings).includes('QUICK_TUNER_CONTROL_EXTENSION'), 'Extension compilation flag lost')
        }
      }
    }
  }
  const previewScheme = readFileSync(join(ios, `App.xcodeproj/xcshareddata/xcschemes/${scheme}.xcscheme`), 'utf8')
  const selectedConfigurations = [...previewScheme.matchAll(/buildConfiguration\s*=\s*"([^"]+)"/g)].map(match => match[1])
  assert.equal(selectedConfigurations.length, 5)
  assert.ok(selectedConfigurations.every(name => name === configuration), 'Preview scheme selects a normal configuration')
  const normalScheme = readFileSync(join(ios, 'App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'), 'utf8')
  assert.ok(!normalScheme.includes(configuration), 'Normal App scheme must not select InternalPreview')
  const podfile = readFileSync(join(ios, 'Podfile'), 'utf8')
  assert.match(podfile, /'InternalPreview'\s*=>\s*:release/, 'CocoaPods must map the preview configuration to release')
  validateExportOptions(readPlist(join(ios, 'InternalPreviewExportOptions.plist')))
  console.log('PASS: preview is enabled only for App/InternalPreview; normal Debug/Release and extension remain off; build 4.2 (27); export is internal-only.')
}

function checkProfile(bundle, expectedBundle) {
  const xml = run('security', ['cms', '-D', '-i', join(bundle, 'embedded.mobileprovision')])
  const profile = JSON.parse(run('python3', ['-c',
    'import json,plistlib,sys; print(json.dumps(plistlib.loads(sys.stdin.buffer.read()),default=str))'], { input: xml }))
  assert.equal(profile.Entitlements?.['application-identifier'], `${team}.${expectedBundle}`, 'Unexpected or wildcard provisioning profile')
  assert.deepEqual(profile.TeamIdentifier, [team], 'Unexpected signing team')
  run('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'pipe' })
}

function checkArchive(path, internal) {
  const archive = resolve(path)
  assert.ok(archive.endsWith('.xcarchive'), 'Expected an .xcarchive path')
  const info = readPlist(join(archive, 'Info.plist'))
  assert.equal(info.SchemeName, internal ? scheme : 'App', 'Archive was created with an unexpected scheme')
  assert.equal(info.ApplicationProperties?.Team, team, 'Archive signing team mismatch')
  assert.equal(info.ApplicationProperties?.ApplicationPath, 'Applications/App.app', 'Unexpected archive application path')
  const app = join(archive, 'Products/Applications/App.app')
  checkApp(app, internal)
  checkProfile(app, 'com.besttake.app')
  checkProfile(join(app, 'PlugIns/QuickTunerControl.appex'), 'com.besttake.app.QuickTunerControl')
  console.log(`PASS: ${internal ? 'marked internal preview' : 'normal release'} archive and signatures verified: ${archive}`)
  return archive
}

function checkApp(app, internal) {
  const info = readPlist(join(app, 'Info.plist'))
  validateBundle(info, readFileSync(join(app, info.CFBundleExecutable)), 'com.besttake.app', internal)
  const extensions = readdirSync(join(app, 'PlugIns')).filter(name => name.endsWith('.appex'))
  assert.deepEqual(extensions, ['QuickTunerControl.appex'], 'Unexpected app extension set')
  const extension = join(app, 'PlugIns/QuickTunerControl.appex')
  const extensionInfo = readPlist(join(extension, 'Info.plist'))
  validateBundle(extensionInfo, readFileSync(join(extension, extensionInfo.CFBundleExecutable)), 'com.besttake.app.QuickTunerControl', false)
}

function writeForcedExportOptions(directory) {
  // Never forward a caller-provided plist or optional xcodebuild arguments.
  // Even if a template is edited, it must match these fixed internal-only values.
  validateExportOptions(readPlist(join(ios, 'InternalPreviewExportOptions.plist')))
  mkdirSync(directory, { recursive: true })
  const path = join(directory, 'ExportOptions-InternalPreview.plist')
  const xml = run('python3', ['-c',
    'import json,plistlib,sys; sys.stdout.buffer.write(plistlib.dumps(json.load(sys.stdin)))'], { input: JSON.stringify(internalExportOptions) })
  writeFileSync(path, xml)
  validateExportOptions(readPlist(path))
  return path
}

function usage() {
  console.log(`Usage: node scripts/internal-plus-preview.mjs <mode> [path] [export-directory]
  check-config                  Validate build separation and fixed export options.
  archive [archive-path]        Archive AppInternalPreview; never uploads.
  check-internal <archive>      Require build27, internal scheme/marker, profiles and signatures.
  check-release <archive|app>   Reject the preview marker in a normal build27 artifact.
  export <archive> [directory]  Verify then UPLOAD for internal TestFlight testing only.

Before archive: build/sync the web app and run CocoaPods install after adding InternalPreview.
No command accepts extra xcodebuild settings, another export plist, or an external-testing option.`)
}

function main(args) {
  const [mode, path, destination, ...extra] = args
  assert.equal(extra.length, 0, 'Unexpected arguments')
  if (!mode || mode === '--help') { usage(); return }
  if (mode === 'check-config') {
    assert.ok(!path && !destination, 'check-config takes no paths')
    checkConfig()
  } else if (mode === 'archive') {
    assert.ok(!destination, 'archive takes only an archive path')
    checkConfig()
    assert.ok(existsSync(join(ios, 'Pods/Target Support Files/Pods-App/Pods-App.internalpreview.xcconfig')),
      'Run CocoaPods install for InternalPreview before archiving')
    const archive = resolve(path ?? defaultArchive)
    assert.ok(archive.endsWith('.xcarchive'), 'Expected an .xcarchive path')
    assert.ok(!existsSync(archive), 'Refusing to overwrite an existing archive')
    mkdirSync(dirname(archive), { recursive: true })
    run('xcodebuild', ['-workspace', join(ios, 'App.xcworkspace'), '-scheme', scheme,
      '-configuration', configuration, '-destination', 'generic/platform=iOS',
      '-archivePath', archive, '-allowProvisioningUpdates', 'archive'], { stdio: 'inherit' })
    checkArchive(archive, true)
  } else if (mode === 'check-internal') {
    assert.ok(path && !destination, 'check-internal requires one archive path')
    checkArchive(path, true)
  } else if (mode === 'check-release') {
    assert.ok(path && !destination, 'check-release requires one artifact path')
    if (path.endsWith('.xcarchive')) checkArchive(path, false)
    else {
      assert.ok(path.endsWith('.app'), 'Expected an .app or .xcarchive path')
      checkApp(resolve(path), false)
      console.log('PASS: normal build27 app and extension contain no internal-preview marker.')
    }
  } else if (mode === 'export') {
    assert.ok(path, 'export requires an archive path')
    checkConfig()
    const archive = checkArchive(path, true)
    const directory = resolve(destination ?? join(dirname(archive), 'export-internal-preview'))
    const options = writeForcedExportOptions(directory)
    console.log('Uploading build27 with testFlightInternalTestingOnly=true. This export cannot request external testing or App Review.')
    run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportPath', directory,
      '-exportOptionsPlist', options, '-allowProvisioningUpdates'], { stdio: 'inherit' })
  } else {
    throw new Error(`Unknown mode: ${mode}`)
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { main(process.argv.slice(2)) }
  catch (error) { console.error(`Internal preview guard: ${error.message}`); process.exitCode = 1 }
}
