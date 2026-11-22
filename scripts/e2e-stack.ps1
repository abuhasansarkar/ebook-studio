# Starts the e2e stack (API + worker) with every variable set in ONE place.
#
# The API and the worker must agree on the storage root, the queue namespace and
# the database. A previous run started them in separate shells with different
# values, which split the storage root and made the image upload fail in a way
# that looked like a product defect.
#
# Usage: powershell -File scripts\e2e-stack.ps1 start|stop

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$action = if ($args.Count -gt 0) { $args[0] } else { "start" }

$env:NODE_ENV = "development"
$env:PORT = "4100"
$env:QUEUE_NAMESPACE = "e2e"
$env:AI_MOCK = "1"
$env:SMTP_HOST = "localhost"
$env:SMTP_PORT = "1025"
$env:APP_URL = "http://localhost:3100"
$env:BETTER_AUTH_URL = "http://localhost:3100"
$env:PAYMENT_PROVIDER = "local"
$env:API_RATE_LIMIT_PER_MINUTE = "5000"
$env:STORAGE_DIR = "$root\.tmp-e2e\storage"
$env:BACKUP_DIR = "$root\backend\backups"
$env:PG_CONTAINER = "ebook-studio-postgres-1"
$env:ALERT_DESTINATION = "e2e-alert-log"
$env:DATABASE_URL = "postgresql://ebook:ebook@localhost:5432/ebook_studio_e2e?schema=public"
$env:REDIS_URL = "redis://localhost:6379"

function Stop-Stack {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -match "src/server.ts|src/worker.ts" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

if ($action -eq "stop") {
  Stop-Stack
  Write-Output "stack stopped"
  exit 0
}

Stop-Stack
New-Item -ItemType Directory -Force -Path "$root\.tmp-logs" | Out-Null

$backend = "$root\backend"
Start-Process -FilePath "node" `
  -ArgumentList "node_modules/tsx/dist/cli.mjs", "--env-file=../.env", "src/server.ts" `
  -WorkingDirectory $backend -WindowStyle Hidden `
  -RedirectStandardOutput "$root\.tmp-logs\api.log" -RedirectStandardError "$root\.tmp-logs\api.err"
Start-Process -FilePath "node" `
  -ArgumentList "node_modules/tsx/dist/cli.mjs", "--env-file=../.env", "src/worker.ts" `
  -WorkingDirectory $backend -WindowStyle Hidden `
  -RedirectStandardOutput "$root\.tmp-logs\worker.log" -RedirectStandardError "$root\.tmp-logs\worker.err"

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:4100/api/v1/health" -TimeoutSec 5
    if ($r.status -eq "ok") { $ready = $true; break }
  } catch { }
}
if (-not $ready) {
  Write-Output "the API did not become ready"
  Get-Content "$root\.tmp-logs\api.err" -ErrorAction SilentlyContinue | Select-Object -Last 20
  exit 1
}
Write-Output "stack ready on 4100"
