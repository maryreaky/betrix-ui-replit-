# Render service updater
# Usage:
# $env:RENDER_API_KEY = 'your_api_key'
# $env:RENDER_SERVICE_ID_WEB = 'srv-xxxxx'        # the web service id
# $env:RENDER_SERVICE_ID_WORKER = 'srv-yyyyy'     # the worker service id (optional)
# .\render_update_services.ps1

Param()

if (-not $env:RENDER_API_KEY) { Write-Error "Set the RENDER_API_KEY environment variable first"; exit 1 }
if (-not $env:RENDER_SERVICE_ID_WEB) { Write-Error "Set the RENDER_SERVICE_ID_WEB environment variable (web service id)"; exit 1 }

$headers = @{ Authorization = "Bearer $($env:RENDER_API_KEY)"; "Content-Type" = 'application/json' }

# Patch web service start command and health check
$webPatch = @{
    startCommand = "npm start"
    healthCheckPath = "/admin/health"
} | ConvertTo-Json

Write-Output "Patching Render web service ($($env:RENDER_SERVICE_ID_WEB)) -> startCommand: npm start, healthCheckPath: /admin/health"
$webResp = Invoke-RestMethod -Method PATCH -Uri "https://api.render.com/v1/services/$($env:RENDER_SERVICE_ID_WEB)" -Headers $headers -Body $webPatch -ErrorAction Stop
Write-Output "Web service patch response: $($webResp | ConvertTo-Json -Depth 2)"

if ($env:RENDER_SERVICE_ID_WORKER) {
    # Optionally patch worker to use npm run worker (background service)
    $workerPatch = @{
        startCommand = "npm run worker"
    } | ConvertTo-Json
    Write-Output "Patching Render worker service ($($env:RENDER_SERVICE_ID_WORKER)) -> startCommand: npm run worker"
    $workerResp = Invoke-RestMethod -Method PATCH -Uri "https://api.render.com/v1/services/$($env:RENDER_SERVICE_ID_WORKER)" -Headers $headers -Body $workerPatch -ErrorAction Stop
    Write-Output "Worker service patch response: $($workerResp | ConvertTo-Json -Depth 2)"
} else {
    Write-Output "No RENDER_SERVICE_ID_WORKER provided — skip worker patching. Consider creating a Background Worker service for npm run worker."
}

Write-Output "Done. Trigger a manual deploy in Render UI if automatic deploy didn't start."
