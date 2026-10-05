param(
    [string]$BaseUrl = "https://ones.ba",
    [string]$OriginIp = ""
)

$ErrorActionPreference = "Stop"
$script:Failures = 0
$BaseUrl = $BaseUrl.TrimEnd("/")
$SiteHost = ([Uri]$BaseUrl).Host

function Write-Check {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if ($Condition) {
        Write-Host "[OK] $Message" -ForegroundColor Green
        return
    }

    $script:Failures += 1
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Get-HttpResponse {
    param(
        [string]$Url,
        [string[]]$ExtraArguments = @()
    )

    $bodyFile = [System.IO.Path]::GetTempFileName()
    try {
        $arguments = @(
            "-sS",
            "-D", "-",
            "-o", $bodyFile,
            "--connect-timeout", "8",
            "--max-time", "20"
        ) + $ExtraArguments + @($Url)

        $headerLines = & curl.exe @arguments 2>&1
        $exitCode = $LASTEXITCODE
        $headers = @{}
        $status = 0

        foreach ($lineValue in $headerLines) {
            $line = [string]$lineValue
            if ($line -match '^HTTP/\S+\s+(\d{3})') {
                $status = [int]$Matches[1]
                $headers = @{}
                continue
            }
            if ($line -match '^([^:]+):\s*(.*)$') {
                $headers[$Matches[1].Trim().ToLowerInvariant()] = $Matches[2].Trim()
            }
        }

        $body = if (Test-Path -LiteralPath $bodyFile) {
            Get-Content -LiteralPath $bodyFile -Raw -ErrorAction SilentlyContinue
        } else {
            ""
        }

        return [pscustomobject]@{
            Url = $Url
            ExitCode = $exitCode
            Status = $status
            Headers = $headers
            Body = $body
        }
    } finally {
        Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
    }
}

function Get-Header {
    param(
        [object]$Response,
        [string]$Name
    )

    return [string]($Response.Headers[$Name.ToLowerInvariant()])
}

Write-Host "oneS production verification: $BaseUrl" -ForegroundColor Cyan

$homeResponse = Get-HttpResponse "$BaseUrl/"
Write-Check ($homeResponse.ExitCode -eq 0 -and $homeResponse.Status -eq 200) "Pocetna stranica vraca HTTP 200"
Write-Check ((Get-Header $homeResponse "server") -match 'cloudflare') "Javni promet prolazi kroz Cloudflare"

$securityHeaders = @(
    @{ Name = "strict-transport-security"; Value = "max-age=" },
    @{ Name = "content-security-policy"; Value = "default-src" },
    @{ Name = "x-content-type-options"; Value = "nosniff" },
    @{ Name = "x-frame-options"; Value = "SAMEORIGIN" },
    @{ Name = "referrer-policy"; Value = "strict-origin-when-cross-origin" },
    @{ Name = "permissions-policy"; Value = "geolocation=()" }
)

foreach ($expected in $securityHeaders) {
    $actual = Get-Header $homeResponse $expected.Name
    Write-Check ($actual -like "*$($expected.Value)*") "Zaglavlje $($expected.Name) je aktivno"
}

$www = Get-HttpResponse "https://www.$SiteHost/"
Write-Check ($www.Status -in @(301, 308)) "www domena preusmjerava"
Write-Check ((Get-Header $www "location") -eq "$BaseUrl/") "www domena vodi na kanonski URL"

$index = Get-HttpResponse "$BaseUrl/index.html"
Write-Check ($index.Status -in @(301, 308)) "/index.html preusmjerava"
Write-Check ((Get-Header $index "location") -eq "$BaseUrl/") "/index.html vodi na cistu pocetnu adresu"

$http = Get-HttpResponse ("http://" + $SiteHost + "/")
Write-Check ($http.Status -in @(301, 308)) "HTTP preusmjerava na HTTPS"

$api = Get-HttpResponse "$BaseUrl/api.php?action=cms"
Write-Check ($api.Status -eq 200) "Javni CMS API vraca HTTP 200"
Write-Check ((Get-Header $api "content-type") -like 'application/json*') "API vraca JSON"
Write-Check ((Get-Header $api "cache-control") -match 'no-store') "API ima no-store"
Write-Check ((Get-Header $api "cf-cache-status") -notmatch '^HIT$') "Cloudflare ne kesira API"
$sessionCookie = Get-Header $api "set-cookie"
Write-Check ($sessionCookie -match '(?i)(^|;)\s*secure(?:;|$)') "Sesijski cookie koristi Secure"
Write-Check ($sessionCookie -match '(?i)(^|;)\s*httponly(?:;|$)') "Sesijski cookie koristi HttpOnly"
Write-Check ($sessionCookie -match '(?i)(^|;)\s*samesite=lax(?:;|$)') "Sesijski cookie koristi SameSite=Lax"

foreach ($privatePath in @("admin.html", "cart.html", "login.html", "profile.html")) {
    $privateResponse = Get-HttpResponse "$BaseUrl/$privatePath"
    Write-Check ($privateResponse.Status -eq 200) "$privatePath je dostupan"
    Write-Check ((Get-Header $privateResponse "cache-control") -match 'no-store') "$privatePath ima no-store"
    Write-Check ((Get-Header $privateResponse "cf-cache-status") -notmatch '^HIT$') "Cloudflare ne kesira $privatePath"
}

foreach ($blockedPath in @("config.local.php", "config.example.php", "data/ones.sqlite", "data/ones.sqlite-wal", "data/backups/", ".env", ".git/config", ".runtime/private.txt", "ones-deployment-ready.zip", "deployment-old/index.html", "tests/private.txt", "deploy/build-package.ps1", "vendor/phpmailer/src/SMTP.php", "migrate.php", "schema-migrations.php", "web.config", "_config.yml", "uploads/test.PHP.jpg")) {
    $blockedResponse = Get-HttpResponse "$BaseUrl/$blockedPath"
    Write-Check ($blockedResponse.Status -in @(403, 404)) "/$blockedPath nije javno dostupan"
}

$stylesheets = @{}
foreach ($pageName in @('index.html','admin.html','login.html','profile.html','cart.html','blog.html','product.html','privacy.html','terms.html','verify.html')) {
    $pageUrl = if ($pageName -eq 'index.html') { "$BaseUrl/" } else { "$BaseUrl/$pageName" }
    $page = Get-HttpResponse $pageUrl
    foreach ($match in [regex]::Matches($page.Body, 'href="([^"?]+\.css)(?:\?v=([^"#]+))?"')) {
        $name = $match.Groups[1].Value
        $version = $match.Groups[2].Value
        Write-Check ($version -match '^[a-f0-9]{16}$') "$pageName koristi CSS fingerprint za $name"
        if ($stylesheets.ContainsKey($name)) { Write-Check ($stylesheets[$name] -ceq $version) "$name ima istu oznaku na svim stranicama" }
        else { $stylesheets[$name] = $version }
    }
}

$sitemap = Get-HttpResponse "$BaseUrl/sitemap.php"
Write-Check ($sitemap.Status -eq 200) "Sitemap vraca HTTP 200"
Write-Check ($sitemap.Body -like "*$BaseUrl/*") "Sitemap koristi produkcijsku domenu"
Write-Check ($sitemap.Body -notmatch '<loc>(?:http://|https://www\.)') "Sitemap nema nekanonske URL adrese"

$robots = Get-HttpResponse "$BaseUrl/robots.txt"
Write-Check ($robots.Status -eq 200) "robots.txt vraca HTTP 200"
Write-Check ($robots.Body -match [regex]::Escape("Sitemap: $BaseUrl/sitemap.php")) "robots.txt koristi apsolutni sitemap URL"

if ($OriginIp -ne "") {
    $origin = Get-HttpResponse "$BaseUrl/" @(
        "--noproxy", "*",
        "--resolve", "${SiteHost}:443:${OriginIp}"
    )
    Write-Check ($origin.ExitCode -ne 0 -or $origin.Status -eq 0) "Hetzner origin nije direktno dostupan mimo Cloudflarea"
}

if ($script:Failures -gt 0) {
    Write-Host "`nProduction verification failed: $script:Failures problem(s)." -ForegroundColor Red
    exit 1
}

Write-Host "`nProduction verification passed." -ForegroundColor Green
