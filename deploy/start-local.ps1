param([int]$Port = 8000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$php = Join-Path $projectRoot '.runtime/php-8.5.11/php.exe'
if (-not (Test-Path -LiteralPath $php)) { throw 'Prvo pokrenite ./deploy/setup-php.ps1' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port mora biti između 1024 i 65535.' }
& $php (Join-Path $projectRoot 'tests/runtime.php')
if ($LASTEXITCODE -ne 0) { throw 'Runtime nije spreman.' }
& $php -S "127.0.0.1:$Port" -t $projectRoot (Join-Path $PSScriptRoot 'local-router.php')
exit $LASTEXITCODE
