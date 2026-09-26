# Import Database on Another PC
# Usage: .\import-data.ps1

$ErrorActionPreference = "Stop"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  StaffSync - Importing Data from Backup" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$backupDir = "$PSScriptRoot\backups"
$latestDbFile = "$backupDir\latest-db-backup.sql"

if (-not (Test-Path $latestDbFile)) {
    Write-Host "ERROR: $latestDbFile not found!" -ForegroundColor Red
    Write-Host "Make sure you copied the backups folder from your original PC." -ForegroundColor Yellow
    exit 1
}

# Ensure Postgres is running
Write-Host "[1/1] Checking Postgres status..." -ForegroundColor Cyan
$status = docker inspect --format "{{.State.Health.Status}}" attendance-postgres 2>$null
if ($status -ne "healthy") {
    Write-Host "Starting Docker services first..." -ForegroundColor Cyan
    docker compose -f infra\docker\docker-compose.yml up -d
    Start-Sleep -Seconds 5
}

Write-Host "Restoring PostgreSQL database from $latestDbFile..." -ForegroundColor Cyan
Get-Content $latestDbFile | docker exec -i attendance-postgres psql -U attendance_user -d attendance_db

Write-Host "      Database restored successfully!" -ForegroundColor Green

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  IMPORT COMPLETE! All data is restored on this PC." -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
