import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const configPath = path.resolve(projectRoot, 'ios/App/App/capacitor.config.json')
const appPluginDir = path.resolve(projectRoot, 'ios/App/App')
const pluginClasses = new Set(['BestTakeAudioPlugin'])

for (const fileName of ['BestTakeAudioPlugin.swift', 'BestTakeAudioPlugin.m']) {
  const filePath = path.join(appPluginDir, fileName)
  if (!fs.existsSync(filePath)) continue
  const fileData = fs.readFileSync(filePath, 'utf8')
  const swiftMatch = /@objc\(([A-Za-z0-9_-]+)\)/.exec(fileData)
  const objcMatch = /CAP_PLUGIN\(([A-Za-z0-9_-]+)/.exec(fileData)
  if (swiftMatch?.[1]) pluginClasses.add(swiftMatch[1])
  if (objcMatch?.[1]) pluginClasses.add(objcMatch[1])
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const existing = Array.isArray(config.packageClassList) ? config.packageClassList : []
const merged = [...existing]
let changed = false

for (const pluginClass of pluginClasses) {
  if (!merged.includes(pluginClass)) {
    merged.push(pluginClass)
    changed = true
  }
}

if (!changed) {
  console.log('ios/App/App/capacitor.config.json already lists local audio plugin classes')
  process.exit(0)
}

config.packageClassList = merged
fs.writeFileSync(configPath, `${JSON.stringify(config, null, '\t')}\n`)
console.log(`Registered local plugin classes in ios/App/App/capacitor.config.json: ${[...pluginClasses].join(', ')}`)
