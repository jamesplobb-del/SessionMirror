import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const configPath = path.resolve(projectRoot, 'ios/App/App/capacitor.config.json')
const pbxprojPath = path.resolve(projectRoot, 'ios/App/App.xcodeproj/project.pbxproj')
const appPluginDir = path.resolve(projectRoot, 'ios/App/App')

const pluginBaseNames = ['BestTakeAudioPlugin', 'DronePlugin', 'MetronomePlugin']

const pbxproj = fs.readFileSync(pbxprojPath, 'utf8')
const moduleMatch = /PRODUCT_MODULE_NAME = ([^;]+);/.exec(pbxproj)
const moduleName = moduleMatch?.[1]?.trim() ?? 'App'

// Capacitor auto-registers via packageClassList. Register exactly once (module-qualified).
// Bare class name + module-qualified + AppDelegate.registerPluginInstance all duplicate.
const requiredPluginClasses = []

for (const pluginBaseName of pluginBaseNames) {
  requiredPluginClasses.push(`${moduleName}.${pluginBaseName}`)
  for (const fileName of [`${pluginBaseName}.swift`, `${pluginBaseName}.m`]) {
    const filePath = path.join(appPluginDir, fileName)
    if (!fs.existsSync(filePath)) continue
    const fileData = fs.readFileSync(filePath, 'utf8')
    const swiftMatch = /@objc\(([A-Za-z0-9_-]+)\)/.exec(fileData)
    const objcMatch = /CAP_PLUGIN\(([A-Za-z0-9_-]+)/.exec(fileData)
    if (swiftMatch?.[1] && swiftMatch[1] !== pluginBaseName) {
      requiredPluginClasses.push(`${moduleName}.${swiftMatch[1]}`)
    }
    if (objcMatch?.[1] && objcMatch[1] !== pluginBaseName) {
      requiredPluginClasses.push(`${moduleName}.${objcMatch[1]}`)
    }
  }
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const existing = Array.isArray(config.packageClassList) ? config.packageClassList : []

const stripped = existing.filter(
  (entry) =>
    !pluginBaseNames.includes(entry) &&
    !requiredPluginClasses.includes(entry) &&
    !entry.endsWith('.BestTakeAudioPlugin') &&
    !entry.endsWith('.DronePlugin') &&
    !entry.endsWith('.MetronomePlugin'),
)
const merged = [...stripped]
let changed = stripped.length !== existing.length

for (const pluginClass of requiredPluginClasses) {
  if (!merged.includes(pluginClass)) {
    merged.push(pluginClass)
    changed = true
  }
}

if (!changed) {
  console.log('ios/App/App/capacitor.config.json already lists local audio plugin once')
  process.exit(0)
}

config.packageClassList = merged
fs.writeFileSync(configPath, `${JSON.stringify(config, null, '\t')}\n`)
console.log(
  `Registered local audio plugin in ios/App/App/capacitor.config.json: ${requiredPluginClasses.join(', ')} (removed duplicate bare name)`,
)
