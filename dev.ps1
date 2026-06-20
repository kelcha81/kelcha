# Launch the ICT engine + the replay app together (Windows / PowerShell).
#   ./dev.ps1
# Engine -> http://localhost:8000 , app -> http://localhost:3000.
# Ctrl+C stops the app; the engine is stopped on exit.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

Write-Host 'Starting ICT engine on http://localhost:8000 ...' -ForegroundColor Green
$engine = Start-Process -PassThru -NoNewWindow python 'server.py' -WorkingDirectory (Join-Path $root 'engine')

try {
  Write-Host 'Starting replay app on http://localhost:3000 ...' -ForegroundColor Cyan
  Push-Location (Join-Path $root 'web')
  npm run dev
}
finally {
  Pop-Location
  if ($engine -and -not $engine.HasExited) {
    Write-Host 'Stopping ICT engine ...' -ForegroundColor Yellow
    Stop-Process -Id $engine.Id -Force
  }
}
