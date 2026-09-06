import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const baselineUrl = new URL('../lint-baseline.json', import.meta.url)
const eslintBin = new URL('../node_modules/eslint/bin/eslint.js', import.meta.url)
const run = spawnSync(process.execPath, [fileURLToPath(eslintBin), '.', '--ext', 'ts,tsx', '--report-unused-disable-directives', '--format', 'json'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})

if (run.error || run.status === 2 || !run.stdout.trim()) {
  process.stderr.write(run.stderr || run.error?.message || 'O lint não produziu um relatório válido.\n')
  process.exit(2)
}

const report = JSON.parse(run.stdout)
const errors = report.reduce((total, file) => total + file.errorCount, 0)
const warnings = report.reduce((total, file) => total + file.warningCount, 0)
const findings = aggregateFindings(report)

if (process.argv.includes('--write')) {
  writeFileSync(baselineUrl, `${JSON.stringify({ version: 1, maxErrors: errors, maxWarnings: warnings, findings }, null, 2)}\n`)
  console.log(`Baseline gravada: ${errors} erro(s), ${warnings} aviso(s), ${findings.length} assinatura(s).`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(baselineUrl, 'utf8'))
const allowed = new Map(baseline.findings.map(finding => [findingKey(finding), finding.count]))
const increases = findings.filter(finding => finding.count > (allowed.get(findingKey(finding)) ?? 0))
console.log(`Lint: ${errors} erro(s), ${warnings} aviso(s); baseline: ${baseline.maxErrors}/${baseline.maxWarnings}.`)

if (errors > baseline.maxErrors || warnings > baseline.maxWarnings || increases.length) {
  for (const finding of increases) {
    console.error(`${finding.file} ${finding.ruleId} ${finding.message} (${finding.count} > ${allowed.get(findingKey(finding)) ?? 0})`)
  }
  process.exit(1)
}

function aggregateFindings(report) {
  const groups = new Map()
  for (const file of report) {
    const filePath = relative(root, file.filePath).replaceAll('\\', '/')
    for (const item of file.messages) {
      const finding = { file: filePath, ruleId: item.ruleId || 'eslint', message: item.message, severity: item.severity, count: 1 }
      const key = findingKey(finding)
      const existing = groups.get(key)
      if (existing) existing.count += 1
      else groups.set(key, finding)
    }
  }
  return [...groups.values()].sort((left, right) => findingKey(left).localeCompare(findingKey(right)))
}

function findingKey(finding) {
  return `${finding.file}\u0000${finding.ruleId}\u0000${finding.message}\u0000${finding.severity}`
}
