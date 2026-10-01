// Separate sharing site keeps existing app builds' YouTube proxy URL working.
// node scripts/build-privacy-page.mjs
// node scripts/deploy-routine-sharing-pages.mjs            (draft)
// node scripts/deploy-routine-sharing-pages.mjs --publish  (verify and publish)
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

let token = process.env.NETLIFY_AUTH_TOKEN
if (!token) {
  const configPath = process.platform === 'darwin'
    ? join(homedir(), 'Library/Preferences/netlify/config.json')
    : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'netlify/config.json')
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  const user = config.users[config.userId]
  token = user.auth?.token || user.token
}
assert.ok(token, 'Sign in with Netlify CLI or set NETLIFY_AUTH_TOKEN')

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const response = await fetch(`https://api.netlify.com/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Netlify ${method} ${path}: HTTP ${response.status}`)
  return response.json()
}

const site = await api('/sites/besttake-share.netlify.app')
assert.equal(site.name, 'besttake-share')
const previous = site.published_deploy?.id ?? null
const contents = new Map()
for (const [destination, source] of Object.entries({
  '/index.html': 'r.html', '/r.html': 'r.html', '/privacy.html': 'privacy.html', '/support.html': 'support.html',
})) {
  contents.set(destination, await readFile(new URL(`../netlify-youtube-proxy/${source}`, import.meta.url)))
}
const files = Object.fromEntries([...contents].map(([path, content]) => [path, createHash('sha1').update(content).digest('hex')]))
let deploy = await api(`/sites/${site.id}/deploys`, {
  method: 'POST', body: { draft: true, files, title: 'BestTake routine sharing pages' },
})
console.log('Draft:', deploy.deploy_ssl_url)
for (const digest of deploy.required ?? []) {
  const [path, content] = [...contents].find(([path]) => files[path] === digest)
  await api(`/deploys/${deploy.id}/files${path}`, { method: 'PUT', body: content, raw: true })
}
for (let attempt = 0; attempt < 20; attempt++) {
  deploy = await api(`/deploys/${deploy.id}`)
  if (deploy.state === 'ready') break
  if (deploy.state === 'error') throw new Error('Netlify deployment failed')
  await delay(1000)
}
assert.equal(deploy.state, 'ready', 'Draft is not ready; left unpublished')
const deployedFiles = await api(`/deploys/${deploy.id}/files`)
assert.deepEqual(Object.fromEntries(deployedFiles.map(item => [item.path, item.sha])), files)
const preview = await fetch(deploy.deploy_ssl_url, { signal: AbortSignal.timeout(30_000) })
assert.equal(preview.status, 200)
assert.equal(await preview.text(), contents.get('/index.html').toString(), 'Preview differs from sharing page')
if (process.argv.includes('--publish')) {
  const current = await api(`/sites/${site.id}`)
  assert.equal(current.published_deploy?.id ?? null, previous, 'Production changed during draft verification')
  await api(`/sites/${site.id}/deploys/${deploy.id}/restore`, { method: 'POST' })
  console.log('Published:', site.ssl_url)
} else {
  console.log('Verified draft. Use --publish to deploy to the branded sharing address.')
}
