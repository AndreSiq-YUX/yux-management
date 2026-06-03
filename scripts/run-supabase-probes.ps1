param(
  [string]$DatabaseUrl = $env:SUPABASE_DB_URL,
  [string]$ProbeDirectory = $(Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')) 'supabase/probes'),
  [string]$PsqlPath = 'psql'
)

$ErrorActionPreference = 'Stop'

if (-not $DatabaseUrl) {
  throw 'Provide -DatabaseUrl or set SUPABASE_DB_URL. Do not commit database passwords.'
}

if (-not (Test-Path $ProbeDirectory)) {
  throw "Probe directory not found: $ProbeDirectory"
}

& $PsqlPath --version | Out-Null

$probeFiles = Get-ChildItem -Path $ProbeDirectory -Filter '*.sql' | Sort-Object Name

if ($probeFiles.Count -eq 0) {
  throw "No SQL probes found in $ProbeDirectory"
}

foreach ($probe in $probeFiles) {
  Write-Host "==> Running probe $($probe.Name)"
  & $PsqlPath $DatabaseUrl -v ON_ERROR_STOP=1 -f $probe.FullName
}

Write-Host 'Supabase probes completed.'
