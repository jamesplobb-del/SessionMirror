/** Keep the iOS dark-appearance icon identical to the light app icon. */
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const iconDir = new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/', import.meta.url)
const lightFilename = 'AppIcon-512@2x.png'
const darkFilename = 'AppIcon-dark.png'
const contentsPath = new URL('Contents.json', iconDir)

await copyFile(new URL(lightFilename, iconDir), new URL(darkFilename, iconDir))

const contents = JSON.parse(await readFile(contentsPath, 'utf8'))
const light = contents.images.find((image) => image.filename === lightFilename)
if (!light) {
  throw new Error(`Missing iOS light app icon: ${fileURLToPath(new URL(lightFilename, iconDir))}`)
}

contents.images = contents.images.filter((image) =>
  !image.appearances?.some((appearance) => appearance.appearance === 'luminosity' && appearance.value === 'dark'),
)
contents.images.push({
  ...light,
  filename: darkFilename,
  appearances: [{ appearance: 'luminosity', value: 'dark' }],
})

await writeFile(contentsPath, `${JSON.stringify(contents, null, 2)}\n`)
console.log('iOS light and dark appearances now use the same app icon')
