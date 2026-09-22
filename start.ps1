# Attendance System - Startup Script
# Usage: .\start.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Attendance System - Starting up" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# --- 1. Ensure Docker is on PATH
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $dockerBin = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
    if (Test-Path $dockerBin) {
        $env:Path += ";$dockerBin"
        Write-Host "[1/3] Docker added to PATH for this session" -ForegroundColor Green
    } else {
        Write-Host "[1/3] ERROR: Docker Desktop not found" -ForegroundColor Red
        Write-Host "      Install from https://www.docker.com/products/docker-desktop/"
        exit 1
    }
} else {
    Write-Host "[1/3] Docker OK" -ForegroundColor Green
}

# --- 2. Start Docker services
Write-Host "[2/3] Starting Docker services..." -ForegroundColor Cyan
docker compose -f infra\docker\docker-compose.yml up -d

Write-Host "      Waiting for Postgres to be healthy..." -ForegroundColor DarkGray
$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    $status = docker inspect --format "{{.State.Health.Status}}" attendance-postgres 2>$null
    if ($status -eq "healthy") {
        Write-Host "      Postgres ready" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $waited++
}
if ($waited -ge $maxWait) {
    Write-Host "      WARNING: Postgres didn't report healthy within $maxWait seconds" -ForegroundColor Yellow
}

# --- 3. Print instructions
Write-Host "[3/3] Ready" -ForegroundColor Green
Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  Docker services running:" -ForegroundColor Cyan
Write-Host "    Postgres:      localhost:55432" -ForegroundColor White
Write-Host "    Redis:         localhost:6379" -ForegroundColor White
Write-Host "    Face service:  http://localhost:5000" -ForegroundColor White
Write-Host ""
Write-Host "  Now open 2 more PowerShell windows and run:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    Window A (backend):" -ForegroundColor Yellow
Write-Host "      cd apps\backend" -ForegroundColor White
Write-Host "      npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "    Window B (frontend):" -ForegroundColor Yellow
Write-Host "      cd apps\frontend" -ForegroundColor White
Write-Host "      npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "  Then open:  http://localhost:3000" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""
