Write-Host "Stopping Attendance System..." -ForegroundColor Cyan
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$env:Path += ";$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin"
docker compose -f infra\docker\docker-compose.yml down
Write-Host "Done." -ForegroundColor Green
