# ============================================================
#  YOUR LAPTOP (Windows) - PostgreSQL + web app + two-way sync watcher
#  Run from the project folder: double-click run-postgres-setup.bat
#  or  powershell -ExecutionPolicy Bypass -File .\setup-postgres-device.ps1 -Neo4jUri bolt://0.tcp.in.ngrok.io:12345
#  Safe to re-run (e.g. when the ngrok address changes).
# ============================================================
param([string]$Neo4jUri = '')

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

function Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red }
function Done-Pause { Write-Host ""; Read-Host "Press Enter to close" | Out-Null }
function Test-Port($h, $p, $ms = 4000) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $r = $c.BeginConnect($h, $p, $null, $null)
        $ok = $r.AsyncWaitHandle.WaitOne($ms, $false) -and $c.Connected
        $c.Close()
        return $ok
    } catch { return $false }
}

if (-not (Test-Path (Join-Path $here 'package.json'))) {
    Fail "package.json not found. Run this from inside the project folder."
    Done-Pause; exit 1
}

# --- 1. Prerequisites ---
Step "Checking Docker and Node.js"
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker is not running. Start Docker Desktop and retry."; Done-Pause; exit 1 }
Ok "Docker is running"
$nodeVer = (cmd /c "node -v 2>nul")
if (-not $nodeVer) { Fail "Node.js not found. Install Node 20 LTS+ from https://nodejs.org"; Done-Pause; exit 1 }
if ([int](($nodeVer.Trim().TrimStart('v')).Split('.')[0]) -lt 20) { Fail "Node $nodeVer is too old (need 20+)."; Done-Pause; exit 1 }
Ok "Node $nodeVer"

# --- 2. PostgreSQL ---
Step "Starting PostgreSQL"
docker compose -f docker-compose.postgres.yml up -d
if ($LASTEXITCODE -ne 0) { Fail "docker compose failed (port 5432 busy? stop any local PostgreSQL service)."; Done-Pause; exit 1 }
$pgReady = $false
for ($i = 1; $i -le 40; $i++) {
    docker exec realestate-postgres pg_isready -U postgres -d realestate *> $null
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
    Write-Host "  waiting... ($i/40)"
    Start-Sleep -Seconds 2
}
if (-not $pgReady) { Fail "PostgreSQL not ready. Check: docker logs realestate-postgres"; Done-Pause; exit 1 }
Ok "PostgreSQL ready on localhost:5432"

# --- 3. Neo4j address (the teammate's ngrok URL) ---
Step "Neo4j address (from your teammate's ngrok)"
if (-not $Neo4jUri) {
    Write-Host "Teammate's script prints something like  bolt://0.tcp.in.ngrok.io:12345"
    $Neo4jUri = (Read-Host "Paste it here (Enter = localhost, single-laptop test)").Trim()
    if (-not $Neo4jUri) { $Neo4jUri = 'localhost:7687' }
}
$addr = $Neo4jUri -replace '^[a-zA-Z+]+://', ''
$addr = $addr.TrimEnd('/')
if ($addr -notmatch ':\d+$') { $addr = "${addr}:7687" }
$boltUri = "bolt://$addr"
$idx = $addr.LastIndexOf(':')
$hostName = $addr.Substring(0, $idx)
$port = [int]$addr.Substring($idx + 1)
if (Test-Port $hostName $port) { Ok "Neo4j reachable at ${hostName}:${port}" }
else {
    Warn "Cannot reach ${hostName}:${port}. Is the teammate's ngrok window open and the address current?"
    $go = Read-Host "Continue anyway (PostgreSQL only for now)? (y/N)"
    if ($go -ne 'y' -and $go -ne 'Y') { Done-Pause; exit 1 }
}

# --- 4. .env ---
Step "Writing .env"
$envPath = Join-Path $here '.env'
if (Test-Path $envPath) { Copy-Item $envPath "$envPath.bak" -Force; Warn "Old .env saved as .env.bak" }
$envText = @"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/realestate"
NEO4J_URI="$boltUri"
NEO4J_USERNAME="neo4j"
NEO4J_PASSWORD="password123"
SYNC_POLL_SECONDS=5
"@
Set-Content -Path $envPath -Value $envText -Encoding ASCII
Ok ".env written (NEO4J_URI = $boltUri)"

# --- 5. Install, create tables (SQL files), seed, first sync ---
Step "npm install"
cmd /c "npm install"
if ($LASTEXITCODE -ne 0) { Fail "npm install failed"; Done-Pause; exit 1 }

Step "Creating tables + seed data from sql\schema.sql and sql\seed.sql"
cmd /c "npm run db:setup"
if ($LASTEXITCODE -ne 0) { Fail "db:setup failed - read the error above"; Done-Pause; exit 1 }

Step "Connection check"
cmd /c "npm run check"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " SETUP COMPLETE" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " Start everything : double-click start-all.bat"
Write-Host "                    (opens sync watcher + web app)"
Write-Host " Open             : http://localhost:3000"
Write-Host " ngrok address changed? Run run-postgres-setup.bat again."
Write-Host "=====================================================" -ForegroundColor Green
$start = Read-Host "Start the watcher and web app now? (Y/n)"
if ($start -ne 'n' -and $start -ne 'N') { Start-Process (Join-Path $here 'start-all.bat') }
Done-Pause
