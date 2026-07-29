param(
  [string]$BaseUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$checks = 0

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

$apiLint = & php -l (Join-Path $projectRoot "api.php")
Assert-True ($LASTEXITCODE -eq 0) "api.php prolazi PHP lint"

$sitemapLint = & php -l (Join-Path $projectRoot "sitemap.php")
Assert-True ($LASTEXITCODE -eq 0) "sitemap.php prolazi PHP lint"

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
Assert-True (@($cms.cms.products).Count -gt 0) "CMS API vraća proizvode"

$csrf = Invoke-RestMethod -Uri "$BaseUrl/api.php?action=csrf-token" -Method Get
Assert-True ($csrf.ok -eq $true -and $csrf.csrfToken.Length -eq 64) "CSRF endpoint vraća token"

$resetGetStatus = Get-HttpStatus -Uri "$BaseUrl/api.php?action=reset-cms"
Assert-True ($resetGetStatus -eq 405) "CMS reset nije dozvoljen GET zahtjevom"

$loginWithoutCsrfStatus = Get-HttpStatus -Uri "$BaseUrl/api.php?action=admin-login" -Method "POST"
Assert-True ($loginWithoutCsrfStatus -eq 403) "admin prijava bez CSRF tokena je odbijena"

$sitemap = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/sitemap.php"
Assert-True ($sitemap.Content -match '/index\.html') "sitemap sadrži početnu stranicu"
Assert-True ($sitemap.Content -match '/privacy\.html') "sitemap sadrži privatnost"
Assert-True ($sitemap.Content -match '/terms\.html') "sitemap sadrži uslove korištenja"

Write-Host ""
Write-Host "Smoke provjera završena: $checks provjera."
