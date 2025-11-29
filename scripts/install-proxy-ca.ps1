<#
Install a proxy CA certificate into Windows trust store.
Usage (Admin PowerShell):
  .\install-proxy-ca.ps1 -CertPath C:\path\to\proxy-ca.cer -Scope LocalMachine
  OR (current user):
  .\install-proxy-ca.ps1 -CertPath C:\path\to\proxy-ca.cer
#>
param(
  [Parameter(Mandatory=$true)] [string] $CertPath,
  [switch] $LocalMachine
)

if (-not (Test-Path $CertPath)) {
  Write-Error "Certificate file not found: $CertPath"
  exit 2
}

try {
  $store = if ($LocalMachine) { 'Cert:\LocalMachine\Root' } else { 'Cert:\CurrentUser\Root' }
  Write-Host "Importing certificate into $store..." -ForegroundColor Cyan
  $cert = Import-Certificate -FilePath $CertPath -CertStoreLocation $store -Verbose -ErrorAction Stop
  Write-Host "Imported certificate. Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
  exit 0
} catch {
  Write-Error "Failed to import certificate: $($_.Exception.Message)"
  exit 1
}
