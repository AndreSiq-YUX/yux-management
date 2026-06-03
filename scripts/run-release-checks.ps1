param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$frontendRoot = Join-Path $repoRoot 'frontend'

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host "==> $Name"
  & $Command
}

Invoke-Step 'Validate vercel.json' {
  Get-Content (Join-Path $repoRoot 'vercel.json') -Raw | ConvertFrom-Json | Out-Null
}

Push-Location $frontendRoot
try {
  if (-not $SkipInstall) {
    Invoke-Step 'Install frontend dependencies' { npm ci }
  }

  Invoke-Step 'Run frontend tests' { npm test }
  Invoke-Step 'Run frontend type-check' { npm run type-check }
  Invoke-Step 'Build frontend' { npm run build }
}
finally {
  Pop-Location
}

Invoke-Step 'Run shared Supabase Edge tests' {
  deno test (Join-Path $repoRoot 'supabase/functions/_shared')
}

$edgeEntrypoints = @(
  'receive-channel-event',
  'simulate-channel-event',
  'process-ai-message',
  'dispatch-outbound-message',
  'retry-outbound-message',
  'request-scheduling',
  'submit-webchat-event'
)

foreach ($entrypoint in $edgeEntrypoints) {
  Invoke-Step "Deno check $entrypoint" {
    deno check (Join-Path $repoRoot "supabase/functions/$entrypoint/index.ts")
  }
}

Invoke-Step 'Check git whitespace' {
  git -C $repoRoot diff --check
}

Write-Host 'Release checks completed.'
