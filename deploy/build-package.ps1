param(
  [string]$OutputPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $OutputPath = Join-Path $projectRoot "ones-deployment-$timestamp.zip"
} elseif (-not [IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $projectRoot $OutputPath
}

$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if ([IO.Path]::GetExtension($OutputPath) -ne ".zip") {
  throw "OutputPath mora zavrsavati sa .zip"
}
if (Test-Path -LiteralPath $OutputPath) {
  throw "Fajl vec postoji: $OutputPath"
}

$runtimeFiles = @(
  ".htaccess",
  "admin.css",
  "admin-feedback.css",
  "admin-responsive.css",
  "admin.html",
  "admin.js",
  "api-client.js",
  "api.php",
  "phone.php",
  "backup-validation.php",
  "login-security.php",
  "pricing.php",
  "email-security.php",
  "cart-integrity.php",
  "cms-integrity.php",
  "cms-relations.php",
  "cms-relations.css",
  "cms-focus.js",
  "verify.html",
  "verify.js",
  "verify.css",
  "app.js",
  "blog.html",
  "blog.js",
  "cart.html",
  "cart.js",
  "data/.htaccess",
  "data/backups/.htaccess",
  "data/web.config",
  "index.html",
  "login.html",
  "login.js",
  "privacy.html",
  "product.html",
  "product.js",
  "profile.html",
  "profile.js",
  "robots.txt",
  "sitemap.php",
  "styles.css",
  "terms.html",
  "theme.js",
  "storage.js",
  "uploads/.htaccess",
  "web.config"
)

$assetRoot = Join-Path $projectRoot "assets"
$assetFiles = Get-ChildItem -LiteralPath $assetRoot -File -Recurse | ForEach-Object {
  $_.FullName.Substring($projectRoot.Length).TrimStart([char[]]"\/").Replace("\", "/")
}
$vendorFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot "vendor/htmlpurifier"), (Join-Path $projectRoot "vendor/phpmailer") -File -Recurse | ForEach-Object {
  $_.FullName.Substring($projectRoot.Length).TrimStart([char[]]"\/").Replace("\", "/")
}
$packageFiles = @($runtimeFiles + $assetFiles + $vendorFiles | Sort-Object -Unique)

$missingFiles = @($packageFiles | Where-Object {
  -not (Test-Path -LiteralPath (Join-Path $projectRoot ($_ -replace "/", "\")) -PathType Leaf)
})
if ($missingFiles.Count -gt 0) {
  throw "Nedostaju obavezni deployment fajlovi: $($missingFiles -join ', ')"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
try {
  $outputDirectory = Split-Path -Parent $OutputPath
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
  }

  $archive = [IO.Compression.ZipFile]::Open($OutputPath, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($relativePath in $packageFiles) {
      $platformPath = $relativePath -replace "/", "\"
      $sourcePath = Join-Path $projectRoot $platformPath
      $sourceFile = Get-Item -LiteralPath $sourcePath
      $entry = $archive.CreateEntry($relativePath, [IO.Compression.CompressionLevel]::Optimal)
      $entry.LastWriteTime = $sourceFile.LastWriteTime
      $sourceStream = [IO.File]::OpenRead($sourcePath)
      $entryStream = $entry.Open()
      try {
        $sourceStream.CopyTo($entryStream)
      } finally {
        $entryStream.Dispose()
        $sourceStream.Dispose()
      }
    }
  } finally {
    $archive.Dispose()
  }
} catch {
  if (Test-Path -LiteralPath $OutputPath) {
    Remove-Item -LiteralPath $OutputPath -Force
  }
  throw
}

$archive = [IO.Compression.ZipFile]::OpenRead($OutputPath)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
} finally {
  $archive.Dispose()
}

$forbiddenEntries = @($entries | Where-Object {
  $_ -match '(^|/)config\.local\.php$' -or
  $_ -match '(^|/)\.env(?:\.|$)' -or
  $_ -match '(^|/)\.git/' -or
  $_ -match '(^|/)tests/' -or
  $_ -match '(^|/)deploy/' -or
  ($_ -match '^data/' -and $_ -notin @("data/.htaccess", "data/backups/.htaccess", "data/web.config")) -or
  ($_ -match '^uploads/' -and $_ -ne "uploads/.htaccess")
})

if ($forbiddenEntries.Count -gt 0) {
  Remove-Item -LiteralPath $OutputPath -Force
  throw "Paket je odbijen jer sadrzi privatne fajlove: $($forbiddenEntries -join ', ')"
}

Write-Host "Deployment paket je napravljen:"
Write-Host $OutputPath
Write-Host "Broj fajlova: $($entries.Count)"
Write-Host "Baza, config.local.php i CMS uploadovi nisu ukljuceni."
