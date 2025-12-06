<#
.SYNOPSIS
  Simple smoke-test script for the Betrix UI deployment.

.DESCRIPTION
  Hits `/health`, `/admin/process-info`, `/admin/routes`, `/admin/redis-ping`,
  posts a test JSON to `/webhook/telegram` and `/webhook/mpesa`, and optionally
  queries Telegram `getWebhookInfo` (if `-BotToken` is provided).

.PARAMETER BaseUrl
  Base URL of the deployed service (default: https://betrix-ui-new.onrender.com)

.PARAMETER BotToken
  Optional Telegram bot token used to call `getWebhookInfo` for status.

.EXAMPLE
  .\smoke-test.ps1 -BaseUrl 'https://your-service.onrender.com' -BotToken '123:ABC'
#>

param(
    [string]$BaseUrl = 'https://betrix-ui-new.onrender.com',
    [string]$BotToken = $env:TELEGRAM_BOT_TOKEN
)

function Invoke-GetSafe {
    param($Path)
    $uri = ($BaseUrl.TrimEnd('/') + $Path)
    try {
        $resp = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec 15 -ErrorAction Stop
        return @{ ok = $true; status = 200; body = $resp }
    } catch {
        return @{ ok = $false; status = ($_.Exception.Response.StatusCode.Value__  -as [int]) -or 0; error = $_.Exception.Message }
    }
}

function Invoke-PostSafe {
    param($Path, $Body)
    $uri = ($BaseUrl.TrimEnd('/') + $Path)
    try {
        $resp = Invoke-RestMethod -Uri $uri -Method Post -Body ($Body | ConvertTo-Json -Depth 5) -ContentType 'application/json' -TimeoutSec 15 -ErrorAction Stop
        return @{ ok = $true; status = 200; body = $resp }
    } catch {
        return @{ ok = $false; status = ($_.Exception.Response.StatusCode.Value__ -as [int]) -or 0; error = $_.Exception.Message }
    }
}

$results = @{}

Write-Host "Running smoke tests against: $BaseUrl`n"

$results.health = Invoke-GetSafe '/health'
Write-Host "GET /health ->" ($results.health.ok ? 'OK' : 'FAIL')

$results.processInfo = Invoke-GetSafe '/admin/process-info'
Write-Host "GET /admin/process-info ->" ($results.processInfo.ok ? 'OK' : 'FAIL')

$results.routes = Invoke-GetSafe '/admin/routes'
Write-Host "GET /admin/routes ->" ($results.routes.ok ? 'OK' : 'FAIL')

# Test both admin-scoped and top-level redis ping aliases
$results.redisPingAdmin = Invoke-GetSafe '/admin/redis-ping'
Write-Host "GET /admin/redis-ping ->" ($results.redisPingAdmin.ok ? 'OK' : 'FAIL')

$results.redisPingAlias = Invoke-GetSafe '/redis-ping'
Write-Host "GET /redis-ping ->" ($results.redisPingAlias.ok ? 'OK' : 'FAIL')

# POST to Telegram webhook endpoints (admin-scoped and top-level alias)
$testBody = @{ test = 'smoke'; ts = (Get-Date).ToString('o') }
$results.telegramPostWebhook = Invoke-PostSafe '/webhook/telegram' $testBody
Write-Host "POST /webhook/telegram ->" ($results.telegramPostWebhook.ok ? 'OK' : 'FAIL')

$results.telegramPostAlias = Invoke-PostSafe '/telegram' $testBody
Write-Host "POST /telegram ->" ($results.telegramPostAlias.ok ? 'OK' : 'FAIL')

# POST to mpesa webhook endpoint
$mpesaBody = @{ Body = @{ Test = 'mpesa-smoke' }; ts = (Get-Date).ToString('o') }
$results.mpesaPost = Invoke-PostSafe '/webhook/mpesa' $mpesaBody
Write-Host "POST /webhook/mpesa ->" ($results.mpesaPost.ok ? 'OK' : 'FAIL')

if ($BotToken) {
    Write-Host "Calling Telegram getWebhookInfo..."
    try {
        $tgUri = "https://api.telegram.org/bot$BotToken/getWebhookInfo"
        $tg = Invoke-RestMethod -Uri $tgUri -Method Get -TimeoutSec 15 -ErrorAction Stop
        $results.telegramInfo = @{ ok = $true; body = $tg }
        Write-Host "Telegram getWebhookInfo -> OK"
    } catch {
        $results.telegramInfo = @{ ok = $false; error = $_.Exception.Message }
        Write-Host "Telegram getWebhookInfo -> FAIL"
    }
} else {
    Write-Host "Skipping Telegram getWebhookInfo (no BotToken supplied)"
}

Write-Host "`nSummary:`n"
$results.GetEnumerator() | ForEach-Object {
    $k = $_.Key
    $v = $_.Value
    $status = ($v.ok -eq $true) ? 'OK' : 'FAIL'
    Write-Host ("{0,-20} : {1}" -f $k, $status)
}

# Exit with non-zero code if any critical check failed
## Consider the top-level aliases as critical since they bypass edge rules
$critical = @('health','processInfo','routes','redisPingAlias','telegramPostAlias')
$failed = $critical | Where-Object { -not ($results[$_] -and $results[$_].ok) }
if ($failed) {
    Write-Host "`nOne or more critical checks failed: $($failed -join ', ')" -ForegroundColor Red
    exit 2
}

Write-Host "`nAll critical checks passed." -ForegroundColor Green
exit 0
