# Export Database for Portability to Another PC
# Usage: .\export-data.ps1

$ErrorActionPreference = "Stop"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  StaffSync - Exporting Data for Portability" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

$backupDir = "$PSScriptRoot\backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$dbFile = "$backupDir\staffsync-db-$timestamp.sql"
$latestDbFile = "$backupDir\latest-db-backup.sql"

Write-Host "[1/1] Exporting PostgreSQL Database..." -ForegroundColor Cyan
docker exec attendance-postgres pg_dump -U attendance_user -d attendance_db --clean --if-exists > $dbFile
Copy-Item $dbFile $latestDbFile -Force

Write-Host "      Database exported to:" -ForegroundColor Green
Write-Host "      $dbFile" -ForegroundColor White
Write-Host "      $latestDbFile" -ForegroundColor White


Write-Host ""
Write-Host "=====================================================" -ForegroundColor Green
Write-Host "  EXPORT COMPLETE!" -ForegroundColor Green
Write-Host "  Copy this entire project folder to the other PC." -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor Green
