import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createCensus } from './census.mjs'

const directory = path.dirname(fileURLToPath(import.meta.url))
process.chdir(path.resolve(directory, '../..'))
const flags = new Set(process.argv.slice(2))
if ([...flags].some(flag => !['--inventory-only', '--include-regressions'].includes(flag))) {
  console.error('Usage: node scripts/practice-qa/run.mjs [--inventory-only] [--include-regressions]')
  process.exit(2)
}
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const out = path.join(directory, 'results', runId)
fs.mkdirSync(out, { recursive: true })
const census = createCensus()
fs.writeFileSync(path.join(out, 'control-census.json'), JSON.stringify(census, null, 2))
const inventories = fs.readdirSync(directory).filter(file => /^inventory-.*\.json$/.test(file))
  .flatMap(file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')))
fs.writeFileSync(path.join(out, 'workflow-inventory.json'), JSON.stringify(inventories, null, 2))
const checks = flags.has('--inventory-only') ? [] : JSON.parse(fs.readFileSync(path.join(directory, 'checks.json'), 'utf8'))
if (flags.has('--include-regressions') && !flags.has('--inventory-only')) {
  const regressions = path.join(directory, 'regressions')
  if (fs.existsSync(regressions)) for (const file of fs.readdirSync(regressions).filter(f => f.endsWith('.mjs')).sort())
    checks.push({ file: `scripts/practice-qa/regressions/${file}`, scope: 'Confirmed-defect regression; must pass once its product fix is applied' })
}
const results = []
for (const check of checks) {
  const start = Date.now()
  const run = spawnSync(process.execPath, [check.file], { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 })
  const log = `${path.basename(check.file, '.mjs')}.log`
  fs.writeFileSync(path.join(out, log), `${run.stdout ?? ''}${run.stderr ?? ''}${run.error ? `\n${run.error}` : ''}`)
  const status = run.error?.code === 'ETIMEDOUT' ? 'blocked' : run.status === 0 ? 'passed' : 'failed'
  results.push({ ...check, status, exitCode: run.status, signal: run.signal, milliseconds: Date.now() - start, log })
  console.log(`${status.toUpperCase()} ${check.file}`)
}
const counts = Object.fromEntries(['passed', 'failed', 'blocked'].map(status => [status, results.filter(r => r.status === status).length]))
const summary = { runId, sourceSha256: census.sourceSha256, controlsDiscovered: census.controls.length,
  curatedWorkflows: inventories.length, automatedChecks: counts,
  uiExecution: 'Not executed by this Node runner. Follow session-protocol.md using browser/Simulator controls; previous observations are not renewed by utility tests.', results }
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2))
fs.writeFileSync(path.join(directory, 'results', 'latest.json'), JSON.stringify({ runId, directory: out }, null, 2))
fs.writeFileSync(path.join(out, 'summary.md'), `# Practice QA ${runId}\n\nSource fingerprint: \`${census.sourceSha256}\`\n\n${census.controls.length} candidate controls; ${inventories.length} curated control/workflow groups.\n\nAutomated checks: ${counts.passed} passed, ${counts.failed} failed, ${counts.blocked} blocked. These are utility/source checks, not live UI coverage.\n\n${summary.uiExecution}\n\n| Check | Status | Scope |\n| --- | --- | --- |\n${results.map(r => `| ${r.file} | ${r.status} | ${r.scope} |`).join('\n')}\n`)
console.log(`Report: ${out}/summary.md`)
if (counts.failed || counts.blocked) process.exitCode = 1
