#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Cuts a GitHub release for the version in manifest.json. Signs first (with
  -Sign or if no signed build exists yet), then publishes a release tagged
  v<version> with BOTH assets:

    no-icks-tube-<version>.xpi   (immutable, per-version)
    no-icks-tube.xpi             (stable name -> /releases/latest/download/...)

  Attaching the version-less copy on every release is what keeps the README's
  "Download" link pointing at the newest signed build.

.EXAMPLE
  ./release.ps1 -Sign                       # sign + release, auto-generated notes
  ./release.ps1 -Sign -NotesFile notes.md   # sign + release with custom notes
  ./release.ps1                             # release an already-signed build
#>
param(
  [string]$Version,
  [string]$NotesFile,
  [string]$Notes,
  [switch]$Sign,
  [switch]$Draft
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

if (-not $Version) {
  $Version = (Get-Content -Raw (Join-Path $root "manifest.json") |
              ConvertFrom-Json).version
}
$tag = "v$Version"

# Refuse to clobber an existing release (AMO also won't re-sign a used version).
gh release view $tag *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Error "Release $tag already exists. Bump the version in manifest.json first."
}

# Locate the signed .xpi for this version (web-ext names it <amo-id>-<ver>.xpi).
$artifacts = Join-Path $root "web-ext-artifacts"
function Find-Signed {
  Get-ChildItem $artifacts -Filter "*-$Version.xpi" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$signed = Find-Signed
if ($Sign -or -not $signed) {
  Write-Host "Signing v$Version..." -ForegroundColor Cyan
  & (Join-Path $root "sign.ps1")
  $signed = Find-Signed
}
if (-not $signed) {
  Write-Error "No signed .xpi for v$Version in web-ext-artifacts/. Run ./sign.ps1 (or pass -Sign)."
}

# Stable-named copies at the repo root (both are gitignored).
$versioned = Join-Path $root "no-icks-tube-$Version.xpi"
$versionless = Join-Path $root "no-icks-tube.xpi"
Copy-Item $signed.FullName $versioned -Force
Copy-Item $signed.FullName $versionless -Force

# Build the release.
$ghArgs = @("release", "create", $tag, $versioned, $versionless, "--title", $tag)
if ($Draft) { $ghArgs += "--draft" }
if ($NotesFile) { $ghArgs += @("--notes-file", $NotesFile) }
elseif ($Notes) { $ghArgs += @("--notes", $Notes) }
else { $ghArgs += "--generate-notes" }

Write-Host "Creating release $tag..." -ForegroundColor Cyan
gh @ghArgs
if ($LASTEXITCODE -ne 0) { Write-Error "gh release create failed (exit $LASTEXITCODE)." }

Write-Host ""
Write-Host "Released $tag with no-icks-tube-$Version.xpi + no-icks-tube.xpi" -ForegroundColor Green
Write-Host "Latest download: https://github.com/HADO564/no-icks-tube/releases/latest/download/no-icks-tube.xpi" -ForegroundColor Green
