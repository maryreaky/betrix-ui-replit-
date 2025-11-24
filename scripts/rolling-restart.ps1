param(
  [string[]]$serviceContainers = @("betrix-ui-betrix-ui-1"),
  [int]$stopTimeoutSec = 60
)
Write-Host "Starting rolling restart for: $($serviceContainers -join ", ")"
foreach ($c in $serviceContainers) {
  Write-Host "Stopping $c with $stopTimeoutSec second timeout..." -ForegroundColor Cyan
  docker stop --time $stopTimeoutSec $c
  Write-Host "Starting $c..." -ForegroundColor Cyan
  docker start $c
  Start-Sleep -Seconds 5
  Write-Host "$c restarted. Waiting 10s for health..." -ForegroundColor Green
  Start-Sleep -Seconds 10
}
Write-Host "Rolling restart complete." -ForegroundColor Green
