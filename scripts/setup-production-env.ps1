<#
.SYNOPSIS
Production Environment Setup Helper for BETRIX Bot

.DESCRIPTION
This script helps you set up required environment variables for production:
- TELEGRAM_TOKEN
- REDIS_URL (with authentication)
- SPORTSMONKS_API

.EXAMPLE
PS> .\setup-production-env.ps1
Prompts for each variable and exports them to the session.

.EXAMPLE
PS> .\setup-production-env.ps1 -File
Saves variables to a .env file instead of exporting to session.

#>
param(
  [switch] $File,
  [string] $EnvFile = '.env'
)

Write-Host "🚀 BETRIX Production Environment Setup" -ForegroundColor Cyan
Write-Host

# Helper function to read secret input
function Read-SecretInput {
  param([string] $Prompt)
  Write-Host $Prompt -ForegroundColor Yellow -NoNewline
  $secureString = Read-Host -AsSecureString
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToCoStr($secureString)
  $plainText = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  [System.Runtime.InteropServices.Marshal]::ZeroFreeBstr($bstr)
  return $plainText
}

# Collect variables
Write-Host "Please provide the following configuration:" -ForegroundColor Cyan
Write-Host

$telegramToken = Read-SecretInput "Enter TELEGRAM_TOKEN: "
$redisUrl = Read-SecretInput "Enter REDIS_URL (e.g., redis://default:password@host:6379): "
$sportmonksApi = Read-SecretInput "Enter SPORTSMONKS_API (SportMonks token): "

Write-Host
Write-Host "Optional: Enter AI provider keys (press Enter to skip):" -ForegroundColor Cyan

$geminiKey = Read-SecretInput "Enter GEMINI_API_KEY (optional): "
$azureEndpoint = Read-SecretInput "Enter AZURE_ENDPOINT (optional): "
$azureKey = Read-SecretInput "Enter AZURE_KEY (optional): "
$huggingfaceToken = Read-SecretInput "Enter HUGGINGFACE_TOKEN (optional): "

Write-Host
Write-Host "Verifying Redis connectivity..." -ForegroundColor Yellow

# Quick Redis connectivity check
try {
  $redisUri = [uri]$redisUrl
  $redisHost = $redisUri.Host
  $redisPort = if ($redisUri.Port -eq 0) { 6379 } else { $redisUri.Port }
  
  Write-Host "   Redis host: $redisHost" -ForegroundColor Gray
  Write-Host "   Redis port: $redisPort" -ForegroundColor Gray
  
  # Try a simple TCP connection
  $tcpClient = New-Object System.Net.Sockets.TcpClient
  $tcpClient.ConnectAsync($redisHost, $redisPort).Wait(5000) | Out-Null
  
  if ($tcpClient.Connected) {
    Write-Host "   ✅ Redis host is reachable" -ForegroundColor Green
    $tcpClient.Close()
  } else {
    Write-Host "   ⚠️  Could not connect to Redis host (may be normal if behind proxy)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "   ⚠️  TCP check failed: $_" -ForegroundColor Yellow
}

Write-Host
Write-Host "Creating configuration..." -ForegroundColor Cyan

if ($File) {
  # Save to .env file
  $envContent = @"
# ===== REQUIRED =====
TELEGRAM_TOKEN=$telegramToken
TELEGRAM_WEBHOOK_SECRET=change_me_to_random_secret
REDIS_URL=$redisUrl

# ===== REQUIRED FOR SPORTMONKS =====
SPORTSMONKS_API=$sportmonksApi

# ===== OPTIONAL: AI PROVIDERS =====
"@

  if ($geminiKey) { $envContent += "`nGEMINI_API_KEY=$geminiKey" }
  if ($azureEndpoint) { $envContent += "`nAZURE_ENDPOINT=$azureEndpoint" }
  if ($azureKey) { $envContent += "`nAZURE_KEY=$azureKey" }
  if ($huggingfaceToken) { $envContent += "`nHUGGINGFACE_TOKEN=$huggingfaceToken" }

  $envContent += "`n`n# ===== DO NOT SET IN PRODUCTION =====`n# SPORTSMONKS_INSECURE=`n"

  Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
  Write-Host "✅ Saved to $EnvFile" -ForegroundColor Green
  Write-Host
  Write-Host "⚠️  IMPORTANT:" -ForegroundColor Yellow
  Write-Host "   - .env file now contains sensitive secrets"
  Write-Host "   - Add .env to .gitignore if not already there"
  Write-Host "   - Never commit .env to version control"
  Write-Host "   - Change TELEGRAM_WEBHOOK_SECRET to a random value"
  Write-Host
} else {
  # Export to session
  $env:TELEGRAM_TOKEN = $telegramToken
  $env:TELEGRAM_WEBHOOK_SECRET = (New-Guid).Guid
  $env:REDIS_URL = $redisUrl
  $env:SPORTSMONKS_API = $sportmonksApi
  
  if ($geminiKey) { $env:GEMINI_API_KEY = $geminiKey }
  if ($azureEndpoint) { $env:AZURE_ENDPOINT = $azureEndpoint }
  if ($azureKey) { $env:AZURE_KEY = $azureKey }
  if ($huggingfaceToken) { $env:HUGGINGFACE_TOKEN = $huggingfaceToken }

  Write-Host "✅ Environment variables exported to current session" -ForegroundColor Green
  Write-Host
  Write-Host "Generated TELEGRAM_WEBHOOK_SECRET: $env:TELEGRAM_WEBHOOK_SECRET" -ForegroundColor Gray
  Write-Host
}

Write-Host "📋 Configuration Summary:" -ForegroundColor Cyan
Write-Host "   TELEGRAM_TOKEN: $([string]$telegramToken.Substring(0, [Math]::Min(10, $telegramToken.Length)))***" -ForegroundColor Gray
Write-Host "   REDIS_URL: $([string]$redisUrl.Substring(0, [Math]::Min(30, $redisUrl.Length)))***" -ForegroundColor Gray
Write-Host "   SPORTSMONKS_API: $([string]$sportmonksApi.Substring(0, [Math]::Min(10, $sportmonksApi.Length)))***" -ForegroundColor Gray
Write-Host
Write-Host "🚀 Next steps:" -ForegroundColor Green
Write-Host "   1. Start the worker: node src/worker-final.js"
Write-Host "   2. Test /live in Telegram"
Write-Host "   3. If TLS errors, run: .\docs\dev-scripts\install-proxy-ca.ps1 -CertPath 'path\to\proxy-ca.cer'"
Write-Host
Write-Host "✨ Setup complete!" -ForegroundColor Green
