# ============================================================
#  TEAMMATE LAPTOP (Windows) - Neo4j + ngrok tunnel
#  Standalone: this one file + run-neo4j-setup.bat is all you need.
#  Needs: Docker Desktop (running) and a free ngrok account.
#  Run:  double-click run-neo4j-setup.bat
#        or  powershell -ExecutionPolicy Bypass -File .\setup-neo4j-device.ps1 -AuthToken YOUR_TOKEN
# ============================================================
param([string]$AuthToken = '', [ValidateSet('tailscale','ngrok')][string]$Mode = 'tailscale')

$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

function Step($m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "[OK]   $m" -ForegroundColor Green }
function Warn($m) { Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Fail($m) { Write-Host "[FAIL] $m" -ForegroundColor Red }
function Done-Pause { Write-Host ""; Read-Host "Press Enter to close" | Out-Null }
function Test-Port($h, $p, $ms = 2000) {
    try {
        $c = New-Object Net.Sockets.TcpClient
        $r = $c.BeginConnect($h, $p, $null, $null)
        $ok = $r.AsyncWaitHandle.WaitOne($ms, $false) -and $c.Connected
        $c.Close()
        return $ok
    } catch { return $false }
}

# --- 1. Docker ---
Step "Checking Docker"
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Fail "Docker is not installed or not running. Start Docker Desktop, wait for 'Engine running', then run this again."
    Done-Pause; exit 1
}
Ok "Docker is running"

# --- 2. Neo4j container ---
Step "Starting Neo4j (first run downloads the image)"
$compose = @'
services:
  neo4j:
    image: neo4j:5
    container_name: realestate-neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: neo4j/password123
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - neo4j_data:/data

volumes:
  neo4j_data:
'@
Set-Content -Path (Join-Path $here 'docker-compose.neo4j.yml') -Value $compose -Encoding ASCII
docker compose -f docker-compose.neo4j.yml up -d
if ($LASTEXITCODE -ne 0) {
    Fail "docker compose failed. If 7474/7687 are busy, stop the other Neo4j and retry."
    Done-Pause; exit 1
}
$ready = $false
for ($i = 1; $i -le 60; $i++) {
    if (Test-Port '127.0.0.1' 7687) { $ready = $true; break }
    Write-Host "  waiting for Neo4j... ($i/60)"
    Start-Sleep -Seconds 3
}
if (-not $ready) { Fail "Neo4j did not start. Check: docker logs realestate-neo4j"; Done-Pause; exit 1 }
Ok "Neo4j is listening on localhost:7687  (Browser: http://localhost:7474, neo4j / password123)"

# --- 3. TAILSCALE mode (default): private IP, no card, no tunnel window ---
if ($Mode -eq 'tailscale') {
    Step "Checking Tailscale"
    function Find-Ts { $c = Get-Command tailscale -ErrorAction SilentlyContinue; if ($c) { return $c.Source }; $p = "$env:ProgramFiles\Tailscale\tailscale.exe"; if (Test-Path $p) { return $p }; return $null }
    $ts = Find-Ts
    if (-not $ts) {
        Warn "Tailscale not found - installing with winget"
        winget install -e --id Tailscale.Tailscale --accept-package-agreements --accept-source-agreements
        $ts = Find-Ts
    }
    if (-not $ts) { Fail "Install Tailscale from https://tailscale.com/download , log in, then run this again."; Done-Pause; exit 1 }
    $ip = ((& $ts ip -4 2>$null) | Select-Object -First 1)
    if (-not $ip) {
        Fail "Tailscale is not logged in. Open the Tailscale app from the Start menu, sign in, then run this again."
        Done-Pause; exit 1
    }
    try { New-NetFirewallRule -DisplayName "Neo4j Bolt 7687" -Direction Inbound -Protocol TCP -LocalPort 7687 -Action Allow -ErrorAction Stop | Out-Null; Ok "Firewall rule added" }
    catch { Warn "Could not add firewall rule (needs Administrator). If the other laptop cannot connect, re-run this as Administrator." }
    $boltUri = "bolt://${ip}:7687"
    Set-Content -Path (Join-Path $here 'neo4j-uri.txt') -Value "NEO4J_URI=$boltUri" -Encoding ASCII
    try { Set-Clipboard -Value $boltUri } catch { }
    Write-Host ""
    Write-Host "=====================================================" -ForegroundColor Green
    Write-Host " NEO4J IS ONLINE (Tailscale)" -ForegroundColor Green
    Write-Host " Send this to your teammate (copied to clipboard):"
    Write-Host ""
    Write-Host "     $boltUri" -ForegroundColor Yellow
    Write-Host ""
    Write-Host " Both laptops must be signed in to the SAME Tailscale network."
    Write-Host " Neo4j Browser: http://localhost:7474 (neo4j / password123)"
    Write-Host "=====================================================" -ForegroundColor Green
    Done-Pause; exit 0
}

# --- 3b. NGROK mode (-Mode ngrok) ---
Step "Checking ngrok"
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Warn "ngrok not found - trying to install it with winget"
    winget install -e --id Ngrok.Ngrok --accept-package-agreements --accept-source-agreements
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
}
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Fail "ngrok is still not available. Install it from https://ngrok.com/download , open a NEW window and run this again."
    Done-Pause; exit 1
}
Ok "ngrok found"

# --- 4. ngrok auth token ---
if (-not $AuthToken) {
    Write-Host "Get your token at https://dashboard.ngrok.com/get-started/your-authtoken"
    $AuthToken = (Read-Host "Paste ngrok authtoken (press Enter to skip if already configured)").Trim()
}
if ($AuthToken) { ngrok config add-authtoken $AuthToken }

# --- 5. Start the tunnel ---
Step "Opening ngrok TCP tunnel to port 7687"
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Start-Process ngrok -ArgumentList 'tcp','7687' -WindowStyle Minimized

$publicUrl = $null
for ($i = 1; $i -le 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $t = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2
        $publicUrl = ($t.tunnels | Where-Object { $_.public_url -like 'tcp://*' } | Select-Object -First 1).public_url
        if ($publicUrl) { break }
    } catch { }
}
if (-not $publicUrl) {
    Fail "ngrok did not give a tunnel. To see the real error, close this and run:  ngrok tcp 7687"
    Write-Host "  Common cause: TCP tunnels need a verified ngrok account (add a card on the dashboard; the free plan is not charged)."
    Done-Pause; exit 1
}
$boltUri = 'bolt://' + $publicUrl.Substring(6)
Set-Content -Path (Join-Path $here 'neo4j-uri.txt') -Value "NEO4J_URI=$boltUri" -Encoding ASCII
try { Set-Clipboard -Value $boltUri } catch { }

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " NEO4J IS ONLINE" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host " Send this to your teammate (also copied to clipboard):"
Write-Host ""
Write-Host "     $boltUri" -ForegroundColor Yellow
Write-Host ""
Write-Host " Neo4j Browser : http://localhost:7474   (neo4j / password123)"
Write-Host " View graph    : MATCH (n) RETURN n"
Write-Host ""
Write-Host " Keep Docker Desktop AND the minimized ngrok window open."
Write-Host " If ngrok restarts the address changes - send the new one."
Write-Host "=====================================================" -ForegroundColor Green
Done-Pause
