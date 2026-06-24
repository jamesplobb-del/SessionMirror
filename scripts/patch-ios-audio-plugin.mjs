import fs from 'node:fs'
import path from 'node:path'

const configPath = path.resolve('ios/App/App/capacitor.config.json')
const pluginClass = 'BestTakeAudioPlugin'

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
if (!Array.isArray(config.packageClassList)) {
  config.packageClassList = []
}

if (!config.packageClassList.includes(pluginClass)) {
  config.packageClassList.push(pluginClass)
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, '\t')}\n`)
  console.log(`Registered ${pluginClass} in ios/App/App/capacitor.config.json`)
}
