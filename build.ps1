#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Builds store-ready, unsigned packages from the single source tree.

    web-ext-artifacts/no-icks-tube-<version>-chrome.zip   -> Chrome Web Store
    web-ext-artifacts/no-icks-tube-<version>-firefox.zip  -> AMO (listed) upload

  The Chrome package is identical to the Firefox one except its manifest has the
  Firefox-only `browser_specific_settings` key removed (Chrome ignores it, but
  the Web Store is happier without it). Both zips contain only the runtime files
  — no tooling, secrets or git history.

  Signing is separate: Firefox builds are signed via sign.ps1 / release.ps1;
  Chrome packages are uploaded to the Web Store dashboard as-is (Google signs).

.EXAMPLE
  ./build.ps1                 # build both zips
  ./build.ps1 -Target chrome  # Chrome only
#>
param(
  [ValidateSet("all", "chrome", "firefox")]
  [string]$Target = "all"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$version = (Get-Content -Raw (Join-Path $root "manifest.json") |
            ConvertFrom-Json).version
$artifacts = Join-Path $root "web-ext-artifacts"
New-Item -ItemType Directory -Force $artifacts | Out-Null

# Only these belong in a store package; everything else is tooling/secrets.
$include = @("manifest.json", "LICENSE", "src", "options", "icons")

function New-Package {
  param(
    [string]$Name,        # "chrome" | "firefox"
    [switch]$StripGecko   # drop browser_specific_settings (Chrome)
  )

  $stage = Join-Path ([System.IO.Path]::GetTempPath()) "noicks-$Name-$version"
  if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
  New-Item -ItemType Directory -Force $stage | Out-Null

  foreach ($item in $include) {
    Copy-Item (Join-Path $root $item) (Join-Path $stage $item) -Recurse -Force
  }

  if ($StripGecko) {
    # Use Node for a faithful JSON round-trip (preserves arrays, 2-space indent).
    $mPath = (Join-Path $stage "manifest.json")
    node -e "const fs=require('fs');const p=process.argv[1];const m=JSON.parse(fs.readFileSync(p));delete m.browser_specific_settings;fs.writeFileSync(p, JSON.stringify(m,null,2)+'\n');" "$mPath"
    if ($LASTEXITCODE -ne 0) { Write-Error "Failed to transform manifest for $Name." }
  }

  $zip = Join-Path $artifacts "no-icks-tube-$version-$Name.zip"
  # web-ext build produces a spec-clean zip (forward-slash paths) on any OS.
  npx --yes web-ext@latest build `
    --source-dir $stage `
    --artifacts-dir $artifacts `
    --overwrite-dest `
    --filename "no-icks-tube-$version-$Name.zip"
  if ($LASTEXITCODE -ne 0) { Write-Error "web-ext build failed for $Name (exit $LASTEXITCODE)." }

  Remove-Item -Recurse -Force $stage
  Write-Host "Built $zip" -ForegroundColor Green
}

if ($Target -in @("all", "chrome"))  { New-Package -Name "chrome" -StripGecko }
if ($Target -in @("all", "firefox")) { New-Package -Name "firefox" }

Write-Host ""
Write-Host "Done. Upload:" -ForegroundColor Green
Write-Host "  Chrome  -> https://chrome.google.com/webstore/devconsole" -ForegroundColor Green
Write-Host "  Firefox -> https://addons.mozilla.org/developers/ (or ./sign.ps1 -Channel listed)" -ForegroundColor Green
