#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Reads .env and signs no-icks-tube for AMO self-distribution (unlisted),
  producing a signed .xpi in web-ext-artifacts/.

.EXAMPLE
  ./sign.ps1
  ./sign.ps1 -Channel listed
  ./sign.ps1 -EnvFile ../secrets.env
#>
param(
  [string]$EnvFile = (Join-Path $PSScriptRoot ".env"),
  [ValidateSet("unlisted", "listed")]
  [string]$Channel = "unlisted"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
  Write-Error "No .env found at '$EnvFile'. Copy .env.example to .env and add your AMO API credentials."
}

# --- Load KEY=VALUE pairs from the .env file -------------------------------
# Ignores blank lines and # comments; strips surrounding single/double quotes.
Get-Content -LiteralPath $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $val = $line.Substring($idx + 1).Trim()
  if (($val.StartsWith('"') -and $val.EndsWith('"')) -or
      ($val.StartsWith("'") -and $val.EndsWith("'"))) {
    $val = $val.Substring(1, $val.Length - 2)
  }
  Set-Item -Path "Env:$key" -Value $val
}

if ([string]::IsNullOrWhiteSpace($env:WEB_EXT_API_KEY) -or
    [string]::IsNullOrWhiteSpace($env:WEB_EXT_API_SECRET)) {
  Write-Error "WEB_EXT_API_KEY and WEB_EXT_API_SECRET must both be set in '$EnvFile'."
}

# --- Show what we're about to sign -----------------------------------------
$version = (Get-Content -Raw (Join-Path $PSScriptRoot "manifest.json") |
            ConvertFrom-Json).version
Write-Host "Signing no-icks-tube v$version  (channel: $Channel)..." -ForegroundColor Cyan

# --- Sign. Exclude tooling/secrets so they never enter the package. --------
npx --yes web-ext@latest sign `
  --source-dir $PSScriptRoot `
  --artifacts-dir (Join-Path $PSScriptRoot "web-ext-artifacts") `
  --channel=$Channel `
  --ignore-files ".env" ".env.*" "*.ps1" "*.xpi" "SUBMITTING.md" ".git/**"

if ($LASTEXITCODE -ne 0) {
  Write-Error "web-ext sign failed (exit $LASTEXITCODE). For 'already signed' errors, bump the version in manifest.json."
}

$signed = Get-ChildItem (Join-Path $PSScriptRoot "web-ext-artifacts") -Filter "*.xpi" |
          Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "Signed: $($signed.FullName)" -ForegroundColor Green
Write-Host "Install: about:addons -> gear -> Install Add-on From File... -> pick that .xpi" -ForegroundColor Green
