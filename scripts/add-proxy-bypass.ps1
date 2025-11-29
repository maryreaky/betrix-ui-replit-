<#
Add api.sportmonks.com to WinHTTP proxy bypass list (best-effort).
This script attempts to read the current WinHTTP proxy config and append
`api.sportmonks.com` and `*.sportmonks.com` to the bypass list.

Usage (Admin PowerShell):
  .\add-proxy-bypass.ps1

Notes:
- If WinHTTP shows "Direct access", your system may use per-user (IE) proxy. Run
  `netsh winhttp import proxy source=ie` to copy browser proxy to WinHTTP, then re-run.
- Changing enterprise proxy config may require proxy/admin changes. Use this script
  only if you control the host.
#>

# Helpers
function Get-WinHttpProxy {
  $out = netsh winhttp show proxy 2>&1
  return $out -join "`n"
}

Write-Host "Reading WinHTTP proxy configuration..." -ForegroundColor Cyan
$cfg = Get-WinHttpProxy
Write-Host $cfg

if ($cfg -match 'Direct access') {
  Write-Warning "WinHTTP is configured for direct access. If you use a browser proxy, run:\n  netsh winhttp import proxy source=ie\nand re-run this script."
  exit 1
}

# Parse proxy-server and bypass-list
$proxyServer = $null
$bypass = ''
if ($cfg -match 'Proxy Server\(s\) :\s*(.+)') { $proxyServer = $Matches[1].Trim() }
if ($cfg -match 'Bypass List\s*:\s*(.*)') { $bypass = $Matches[1].Trim() }

if (-not $proxyServer) {
  Write-Error "Could not determine WinHTTP proxy server from output. Aborting."
  exit 2
}

$newEntries = 'api.sportmonks.com;*.sportmonks.com'
if ($bypass -and -not [string]::IsNullOrWhiteSpace($bypass)) {
  # Append if not present
  $existing = $bypass -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
  $toAdd = $newEntries -split ';' | Where-Object { $existing -notcontains $_ }
  $final = ($existing + $toAdd) -join ';'
} else {
  $final = $newEntries
}

Write-Host "Setting WinHTTP proxy to: $proxyServer with bypass list: $final" -ForegroundColor Yellow
$cmd = "netsh winhttp set proxy `"$proxyServer`" bypass-list=`"$final`""
Write-Host $cmd

try {
  iex $cmd
  Write-Host "Proxy updated. Verify with: netsh winhttp show proxy" -ForegroundColor Green
  exit 0
} catch {
  Write-Error "Failed to set winhttp proxy: $($_.Exception.Message)"
  exit 3
}
