# Setup Script for New PC
# Usage: Run this script on the new PC: .\setup-new-pc.ps1

$ErrorActionPreference = "Stop"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  StaffSync - Automated Setup for New PC" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Check Node.js
Write-Host "`n[1/6] Checking Node.js..." -ForegroundColor Cyan
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Node.js is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js 18 or 20 LTS from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
$nodeVersion = node -v
Write-Host "      Node.js OK: $nodeVersion" -ForegroundColor Green

# 2. Check Docker
Write-Host "`n[2/6] Checking Docker..." -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $dockerBin = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
    if (Test-Path $dockerBin) {
        $env:Path += ";$dockerBin"
    } else {
        Write-Host "ERROR: Docker is not installed or not running." -ForegroundColor Red
        Write-Host "Please install Docker Desktop from https://www.docker.com/" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host "      Docker OK" -ForegroundColor Green

# 3. Setup Environment Files (.env)
Write-Host "`n[3/6] Setting up environment files (.env)..." -ForegroundColor Cyan
if (-not (Test-Path "apps\backend\.env")) {
    if (Test-Path "apps\backend\.env.example") {
        Copy-Item "apps\backend\.env.example" "apps\backend\.env"
        Write-Host "      Created apps\backend\.env from .env.example" -ForegroundColor Green
    }
} else {
    Write-Host "      apps\backend\.env already exists" -ForegroundColor DarkGray
}

if (-not (Test-Path "apps\frontend\.env.local")) {
    Set-Content "apps\frontend\.env.local" "NEXT_PUBLIC_API_URL=http://localhost:4000`n"
    Write-Host "      Created apps\frontend\.env.local" -ForegroundColor Green
} else {
    Write-Host "      apps\frontend\.env.local already exists" -ForegroundColor DarkGray
}

# 4. Install Dependencies
Write-Host "`n[4/6] Installing npm dependencies..." -ForegroundColor Cyan
npm install

# 5. Start Docker Containers
Write-Host "`n[5/6] Starting Docker containers (Postgres, Redis)..." -ForegroundColor Cyan
docker compose -f infra\docker\docker-compose.yml up -d

Write-Host "      Waiting for PostgreSQL to become ready..." -ForegroundColor DarkGray
$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    $status = docker inspect --format "{{.State.Health.Status}}" attendance-postgres 2>$null
    if ($status -eq "healthy") {
        Write-Host "      Postgres is ready!" -ForegroundColor Green
        break
    }
    Start-Sleep -Seconds 1
    $waited++
}

# 6. Database Migration / Restore
Write-Host "`n[6/6] Initializing Database..." -ForegroundColor Cyan
cd apps\backend
npx prisma generate

$latestDbFile = "$PSScriptRoot\backups\latest-db-backup.sql"
if (Test-Path $latestDbFile) {
    Write-Host "      Found existing database backup ($latestDbFile)." -ForegroundColor Cyan
    Write-Host "      Restoring your existing data..." -ForegroundColor Cyan
    Get-Content $latestDbFile | docker exec -i attendance-postgres psql -U attendance_user -d attendance_db
    Write-Host "      Database backup restored successfully!" -ForegroundColor Green
} else {
    Write-Host "      Running Prisma db push and initial seed..." -ForegroundColor Cyan
    npx prisma db push
    npm run seed
    Write-Host "      Fresh database schema initialized with seed data!" -ForegroundColor Green
}

cd ..\..

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE! StaffSync is ready on this PC." -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the application:" -ForegroundColor Cyan
Write-Host "  Terminal A (Backend):" -ForegroundColor Yellow
Write-Host "    npm run dev:backend" -ForegroundColor White
Write-Host ""
Write-Host "  Terminal B (Frontend):" -ForegroundColor Yellow
Write-Host "    npm run dev:frontend" -ForegroundColor White
Write-Host ""
Write-Host "Then open in your browser: http://localhost:3000" -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Cyan
