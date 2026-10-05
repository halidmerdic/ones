param(
  [string]$BaseUrl = "http://127.0.0.1:8000",
  [string]$PhpBinary = $env:PHP_BINARY
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $PhpBinary) {
  $localPhp = Join-Path $projectRoot '.runtime/php-8.5.11/php.exe'
  $PhpBinary = if (Test-Path -LiteralPath $localPhp) { $localPhp } else { 'php' }
}
& $PhpBinary (Join-Path $PSScriptRoot 'runtime.php')
if ($LASTEXITCODE -ne 0) { throw 'Odaberite podržani PHP runtime pomoću -PhpBinary.' }
$checks = 0
$packageBuilderExists = Test-Path -LiteralPath (Join-Path $projectRoot "deploy/build-package.ps1")
$productionVerifierExists = Test-Path -LiteralPath (Join-Path $projectRoot "deploy/verify-production.ps1")
$robots = Get-Content -LiteralPath (Join-Path $projectRoot "robots.txt") -Raw
$robotsHasAbsoluteSitemap = $robots -match [regex]::Escape("Sitemap: https://ones.ba/sitemap.php")

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "FAILED: $Message"
  }

  $script:checks += 1
  Write-Host "OK: $Message"
}

Assert-True $packageBuilderExists "sigurni deployment paket se moze napraviti"
Assert-True $productionVerifierExists "produkcijska provjera postoji"
Assert-True $robotsHasAbsoluteSitemap "robots.txt koristi apsolutni produkcijski sitemap URL"

$packageTestPath = Join-Path ([IO.Path]::GetTempPath()) ("ones-deployment-smoke-" + [guid]::NewGuid().ToString("N") + ".zip")
try {
  & (Join-Path $projectRoot "deploy/build-package.ps1") -OutputPath $packageTestPath | Out-Null
  Assert-True (($LASTEXITCODE -eq 0) -or ($null -eq $LASTEXITCODE)) "deployment ZIP se uspjesno generise"

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $packageArchive = [IO.Compression.ZipFile]::OpenRead($packageTestPath)
  try {
    $packageEntries = @($packageArchive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
  } finally {
    $packageArchive.Dispose()
  }

  $requiredPackageEntries = @(".htaccess", "api.php", "phone.php", "backup-validation.php", "login-security.php", "pricing.php", "email-security.php", "cart-integrity.php", "cms-integrity.php", "cms-relations.php", "cms-relations.css", "admin-feedback.css", "verify.html", "verify.js", "verify.css", "vendor/phpmailer/src/PHPMailer.php", "vendor/phpmailer/src/SMTP.php", "vendor/phpmailer/src/Exception.php", "vendor/htmlpurifier/library/HTMLPurifier.auto.php", "assets/vendor/purify-3.4.16.min.js", "assets/favicon.svg", "data/.htaccess", "uploads/.htaccess")
  $missingPackageEntries = @($requiredPackageEntries | Where-Object { $_ -notin $packageEntries })
  $missingPackageEntries += @('storage.js', 'admin-responsive.css' | Where-Object { $_ -notin $packageEntries })
  $privatePackageEntries = @($packageEntries | Where-Object {
    $_ -eq "config.local.php" -or
    $_ -match '^data/(?!\.htaccess$|backups/\.htaccess$|web\.config$)' -or
    $_ -match '^uploads/(?!\.htaccess$)' -or
    $_ -match '^(?:deploy|tests|\.runtime|\.github)/'
  })

  Assert-True ($missingPackageEntries.Count -eq 0) "deployment ZIP sadrzi obavezne aplikacijske fajlove"
  Assert-True ($privatePackageEntries.Count -eq 0) "deployment ZIP ne sadrzi bazu, tajne, testove ni CMS medije"
} finally {
  if (Test-Path -LiteralPath $packageTestPath) {
    Remove-Item -LiteralPath $packageTestPath -Force
  }
}

function Get-HttpStatus {
  param(
    [string]$Uri,
    [string]$Method = "GET"
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method $Method
    return [int]$response.StatusCode
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}

$apiLint = & $PhpBinary -l (Join-Path $projectRoot "api.php")
Assert-True ($LASTEXITCODE -eq 0) "api.php prolazi PHP lint"

$authSecurity = & $PhpBinary (Join-Path $PSScriptRoot "auth-security.php")
Assert-True ($LASTEXITCODE -eq 0) "lozinke, rate limit i sesijske sigurnosne provjere prolaze"

$businessLogic = & $PhpBinary (Join-Path $PSScriptRoot "business-logic.php")
Assert-True ($LASTEXITCODE -eq 0) "proizvodi, korpa i slanje upita prolaze poslovne provjere"

$storageReliability = & $PhpBinary (Join-Path $PSScriptRoot "storage-reliability.php")
Assert-True ($LASTEXITCODE -eq 0) "CMS revizije, backup i atomsko spremanje prolaze"

$cmsValidation = & $PhpBinary (Join-Path $PSScriptRoot "validate-cms.php")
Assert-True ($LASTEXITCODE -eq 0) "postojeći CMS podaci prolaze serversku validaciju"

$networkSecurity = & $PhpBinary (Join-Path $PSScriptRoot "network-security.php")
Assert-True ($LASTEXITCODE -eq 0) "proxy, HTTPS i IP sigurnosne provjere prolaze"

foreach ($securityTest in @("cms-xss.php", "restore-security.php", "backup-atomicity.php", "admin-bootstrap.php", "login-limits.php")) {
  & $PhpBinary (Join-Path $PSScriptRoot $securityTest) | Out-Null
  Assert-True ($LASTEXITCODE -eq 0) "$securityTest prolazi sigurnosnu regresiju"
}

$sitemapLint = & $PhpBinary -l (Join-Path $projectRoot "sitemap.php")
Assert-True ($LASTEXITCODE -eq 0) "sitemap.php prolazi PHP lint"

$htaccess = Get-Content -LiteralPath (Join-Path $projectRoot ".htaccess") -Raw -Encoding UTF8
Assert-True ($htaccess -notmatch 'HTTP:X-Forwarded-Proto') ".htaccess ne vjeruje javno poslanom X-Forwarded-Proto zaglavlju"
Assert-True ($htaccess -match 'Strict-Transport-Security') ".htaccess postavlja HSTS na HTTPS odgovore"
Assert-True ($htaccess -match 'api\\\.php\|admin\\\.html\|cart\\\.html\|login\\\.html\|profile\\\.html') ".htaccess izuzima privatne stranice iz keša"
Assert-True ($htaccess -match 'deploy\|tests') ".htaccess blokira razvojne deploy i tests direktorije"

$uploadHtaccess = Get-Content -LiteralPath (Join-Path $projectRoot "uploads\.htaccess") -Raw -Encoding UTF8
Assert-True ($uploadHtaccess -match 'php\|phtml\|phar') "uploads folder blokira izvršne PHP datoteke"

$htmlFiles = Get-ChildItem -LiteralPath $projectRoot -Filter "*.html" -File
foreach ($htmlFile in $htmlFiles) {
  $content = Get-Content -LiteralPath $htmlFile.FullName -Raw -Encoding UTF8
  $references = [regex]::Matches($content, '(?:src|href)="([^"]+)"')
  $ids = [regex]::Matches($content, '\sid="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
  $duplicateIds = $ids | Group-Object | Where-Object { $_.Count -gt 1 }
  Assert-True (@($duplicateIds).Count -eq 0) "$($htmlFile.Name) nema ponovljenih ID vrijednosti"

  $ariaControls = [regex]::Matches($content, 'aria-controls="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
  foreach ($controlledId in $ariaControls) {
    Assert-True ($ids -contains $controlledId) "$($htmlFile.Name) aria-controls pokazuje na #$controlledId"
  }

  $imagesWithoutAlt = [regex]::Matches($content, '<img\b(?![^>]*\balt=)[^>]*>', [Text.RegularExpressions.RegexOptions]::IgnoreCase)
  Assert-True ($imagesWithoutAlt.Count -eq 0) "$($htmlFile.Name) sve slike imaju alt tekst"

  foreach ($reference in $references) {
    $value = $reference.Groups[1].Value
    if ($value -match '^(#|https?:|mailto:|tel:|viber:)' -or $value -eq "") {
      continue
    }

    $pathOnly = ($value -split '[?#]')[0]
    if ($pathOnly -eq "") {
      continue
    }

    $target = Join-Path $projectRoot ($pathOnly -replace '/', [IO.Path]::DirectorySeparatorChar)
    Assert-True (Test-Path -LiteralPath $target) "$($htmlFile.Name) referencira postojeći resurs $pathOnly"
  }
}

$cms = Invoke-RestMethod -Uri "$BaseUrl/api.php?action=cms" -Method Get
Assert-True ($cms.ok -eq $true) "javni CMS API odgovara"
$cmsHeaders = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/api.php?action=cms" -Method Get
Assert-True ([string]$cmsHeaders.Headers["Cache-Control"] -match 'no-store') "CMS API odgovor se ne kešira"
Assert-True (@($cms.cms.products).Count -gt 0) "CMS API vraća proizvode"
Assert-True ($cms.cms.PSObject.Properties.Name -notcontains "launchChecklist") "javni CMS ne izlaže administratorsku kontrolnu listu"
Assert-True ($cms.cms.contact.PSObject.Properties.Name -notcontains "orderMessageTemplate") "javni CMS ne izlaže interne predloške poruka"
Assert-True ($cms.cms.contact.PSObject.Properties.Name -notcontains "customerEmailBodyTemplate") "javni CMS ne izlaže interne email predloške"

$enabledCategoryNames = @(
  $cms.cms.categories |
    Where-Object { $_.enabled -ne $false -and -not [string]::IsNullOrWhiteSpace([string]$_.name) } |
    ForEach-Object { [string]$_.name }
)
$publicProducts = @(
  $cms.cms.products |
    Where-Object { $_.enabled -ne $false -and $enabledCategoryNames -contains [string]$_.category }
)
$categoryHiddenProducts = @(
  $cms.cms.products |
    Where-Object { $_.enabled -ne $false -and $enabledCategoryNames -notcontains [string]$_.category }
)
Assert-True ($publicProducts.Count -gt 0) "CMS ima barem jedan javni proizvod u uključenoj kategoriji"
foreach ($product in $publicProducts) {
  Assert-True ($enabledCategoryNames -contains [string]$product.category) "javni proizvod $($product.id) pripada javnoj kategoriji"
  Assert-True ($product.PSObject.Properties.Name -notcontains "enabled") "javni proizvod $($product.id) ne izlaže internu oznaku vidljivosti"
}

$csrf = Invoke-RestMethod -Uri "$BaseUrl/api.php?action=csrf-token" -Method Get
Assert-True ($csrf.ok -eq $true -and $csrf.csrfToken.Length -eq 64) "CSRF endpoint vraća token"

$resetGetStatus = Get-HttpStatus -Uri "$BaseUrl/api.php?action=reset-cms"
Assert-True ($resetGetStatus -eq 405) "CMS reset nije dozvoljen GET zahtjevom"

$loginWithoutCsrfStatus = Get-HttpStatus -Uri "$BaseUrl/api.php?action=admin-login" -Method "POST"
Assert-True ($loginWithoutCsrfStatus -eq 403) "admin prijava bez CSRF tokena je odbijena"

$adminCmsStatus = Get-HttpStatus -Uri "$BaseUrl/api.php?action=admin-cms"
Assert-True ($adminCmsStatus -eq 401) "puni CMS zapis nije dostupan bez admin prijave"

$sitemap = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/sitemap.php"
$normalizedBaseUrl = $BaseUrl.TrimEnd("/")
$escapedHomeUrl = [regex]::Escape("$normalizedBaseUrl/")
Assert-True ($sitemap.Content -match "<loc>$escapedHomeUrl</loc>") "sitemap sadrži početnu stranicu"
Assert-True ($sitemap.Content -match '/privacy\.html') "sitemap sadrži privatnost"
Assert-True ($sitemap.Content -match '/terms\.html') "sitemap sadrži uslove korištenja"

foreach ($product in $publicProducts) {
  if ([string]::IsNullOrWhiteSpace([string]$product.id)) {
    continue
  }
  $encodedId = [Uri]::EscapeDataString([string]$product.id)
  Assert-True ($sitemap.Content -match [regex]::Escape("product.html?id=$encodedId")) "sitemap sadrži javni proizvod $($product.id)"
}

foreach ($product in $categoryHiddenProducts) {
  if ([string]::IsNullOrWhiteSpace([string]$product.id)) {
    continue
  }
  $encodedId = [Uri]::EscapeDataString([string]$product.id)
  Assert-True ($sitemap.Content -notmatch [regex]::Escape("product.html?id=$encodedId")) "sitemap ne sadrži proizvod $($product.id) iz isključene kategorije"
}

Write-Host ""
Write-Host "Smoke provjera završena: $checks provjera."
