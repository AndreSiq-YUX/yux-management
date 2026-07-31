param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$backendRoot = Join-Path $repoRoot 'backend'
$frontendRoot = Join-Path $repoRoot 'frontend'

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )

  Write-Host "==> $Name"
  $global:LASTEXITCODE = 0
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

Invoke-Step 'Validate Dokploy compose exists' {
  $composePath = Join-Path $repoRoot 'docker-compose.dokploy.yml'
  if (-not (Test-Path $composePath)) {
    throw "Missing Dokploy compose file: $composePath"
  }
}

Invoke-Step 'Validate Dokploy compose syntax' {
  $composePath = Join-Path $repoRoot 'docker-compose.dokploy.yml'
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose -f $composePath config *> $null
    return
  }

  if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw 'Docker is not available and Python fallback is not installed.'
  }

  $script = @'
from pathlib import Path
import yaml

compose = yaml.safe_load(Path("docker-compose.dokploy.yml").read_text(encoding="utf-8"))
required = {
    "yux-frontend",
    "yux-backend-api",
    "yux-backend-worker",
    "yux-postgres",
    "yux-redis",
    "yux-agent-harness-runtime",
}
services = set((compose or {}).get("services", {}))
missing = sorted(required - services)
if missing:
    raise SystemExit(f"Missing services: {missing}")

volumes = set((compose or {}).get("volumes", {}))
for volume in ("yux_postgres_data", "yux_redis_data", "yux_materials_data", "yux_omnichannel_attachments_data"):
    if volume not in volumes:
        raise SystemExit(f"Missing volume: {volume}")
'@
  Push-Location $repoRoot
  try {
    $script | python -
  }
  finally {
    Pop-Location
  }
}

Push-Location $backendRoot
try {
  if (-not $SkipInstall) {
    Invoke-Step 'Install backend dependencies' { npm ci }
  }

  Invoke-Step 'Run backend tests' { npm test }
  Invoke-Step 'Run backend type-check' { npm run type-check }
  Invoke-Step 'Build backend' { npm run build }
  Invoke-Step 'Audit backend production dependencies' { npm audit --omit=dev }
}
finally {
  Pop-Location
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

Invoke-Step 'Check git whitespace' {
  git -C $repoRoot diff --check
}

Write-Host 'Release checks completed.'
