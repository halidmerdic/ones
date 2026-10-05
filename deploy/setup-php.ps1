param()
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = '8.5.11'
$expectedHash = '0ea96e0d2b9b737a6036f05cf4e95c49313faa6d0f27bd97edb2742503f0c043'
$runtimeRoot = Join-Path $projectRoot '.runtime'
$phpRoot = Join-Path $runtimeRoot "php-$version"
$archive = Join-Path $runtimeRoot "php-$version.zip"
New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $archive)) {
  Invoke-WebRequest -Uri "https://downloads.php.net/~windows/releases/archives/php-$version-nts-Win32-vs17-x64.zip" -OutFile $archive
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) {
  throw 'PHP arhiva ne odgovara objavljenom SHA-256. Instalacija prekinuta.'
}
if (-not (Test-Path -LiteralPath (Join-Path $phpRoot 'php.exe'))) {
  Expand-Archive -LiteralPath $archive -DestinationPath $phpRoot
}
$ini = Get-Content -LiteralPath (Join-Path $phpRoot 'php.ini-development') -Raw
foreach ($extension in @('curl','fileinfo','gd','mbstring','openssl','pdo_mysql','pdo_sqlite','sqlite3')) {
  $ini = $ini -replace "(?m)^;extension=$extension\r?$", "extension=$extension"
}
$extensionPath = (Join-Path $phpRoot 'ext').Replace('\','/')
$ini += "`nextension_dir=`"$extensionPath`"`nerror_reporting=E_ALL`n"
[IO.File]::WriteAllText((Join-Path $phpRoot 'php.ini'), $ini)
& (Join-Path $phpRoot 'php.exe') (Join-Path $projectRoot 'tests/runtime.php')
if ($LASTEXITCODE -ne 0) { throw 'PHP runtime provjera nije prošla.' }
Write-Host "Projekt koristi PHP $version. Pokretanje: ./deploy/start-local.ps1"
