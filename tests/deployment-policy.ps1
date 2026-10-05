$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $root 'deploy/css-versions.ps1')
$checks = 0
function Assert-Policy([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
  $script:checks++
}
function Read-ZipText($Archive, [string]$Name) {
  $entry = $Archive.GetEntry($Name)
  if (-not $entry) { throw "Missing entry: $Name" }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}
function Test-Package([string]$File) {
  $archive = [IO.Compression.ZipFile]::OpenRead($File)
  try {
    $versions = @{}
    foreach ($name in @('styles.css','admin.css','cms-relations.css','admin-feedback.css','admin-responsive.css','verify.css')) {
      $text = Read-ZipText $archive $name
      Assert-Policy (-not $text.Contains("`r")) 'Packaged CSS is canonical LF'
      $sha = [Security.Cryptography.SHA256]::Create()
      try { $versions[$name] = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant().Substring(0,16) }
      finally { $sha.Dispose() }
    }
    foreach ($page in (Get-OneSPublicPages)) {
      $html = Read-ZipText $archive $page
      foreach ($match in [regex]::Matches($html, 'href="([^"?]+\.css)\?v=([a-f0-9]{16})"')) {
        Assert-Policy ($match.Groups[2].Value -ceq $versions[$match.Groups[1].Value]) "$page must reference its packaged CSS bytes"
      }
      Assert-Policy ($html -ceq (Update-OneSStylesheetReferences $html $versions)) "Unversioned or stale CSS: $page"
    }
    foreach ($name in @('config.local.php','data/test.sqlite','data/ones.sqlite','deployment-old/index.html','ones-backup.zip','README.md','tests/deployment-policy.ps1','deploy/build-package.ps1','_config.yml')) {
      Assert-Policy ($null -eq $archive.GetEntry($name)) "Private file packaged: $name"
    }
    foreach ($name in @('.htaccess','data/.htaccess','data/backups/.htaccess','uploads/.htaccess')) {
      Assert-Policy ($null -ne $archive.GetEntry($name)) "Required hidden protection file missing: $name"
    }
    return $versions
  } finally { $archive.Dispose() }
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('ones-deploy-policy-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temporary | Out-Null
try {
  $package = Join-Path $temporary 'original.zip'
  & (Join-Path $root 'deploy/build-package.ps1') -OutputPath $package | Out-Null
  $before = Test-Package $package
  $source = Join-Path $temporary 'source'
  [IO.Compression.ZipFile]::ExtractToDirectory($package, $source)
  New-Item -ItemType Directory -Path (Join-Path $source 'deploy') | Out-Null
  foreach ($file in @('build-package.ps1','css-versions.ps1','sync-css.ps1')) { Copy-Item -LiteralPath (Join-Path $root "deploy/$file") -Destination (Join-Path $source "deploy/$file") }
  $builder = Join-Path $source 'deploy/build-package.ps1'
  # A CSS-only change must invalidate every consumer without editing source HTML.
  [IO.File]::AppendAllText((Join-Path $source 'admin.css'), "`r`n/* Changed CSS fixture */`r`n")
  [IO.File]::WriteAllText((Join-Path $source 'config.local.php'), '<?php /* PRIVATE FIXTURE */')
  [IO.File]::WriteAllText((Join-Path $source 'ones-backup.zip'), 'PRIVATE FIXTURE')
  New-Item -ItemType Directory -Path (Join-Path $source 'deployment-old') | Out-Null
  [IO.File]::WriteAllText((Join-Path $source 'deployment-old/index.html'), 'PRIVATE FIXTURE')
  $updated = Join-Path $temporary 'updated.zip'
  & $builder -OutputPath $updated | Out-Null
  $after = Test-Package $updated
  Assert-Policy ($before['admin.css'] -cne $after['admin.css']) 'CSS content change did not invalidate cache'
  Assert-Policy ($before['styles.css'] -ceq $after['styles.css']) 'Unchanged CSS fingerprint changed'
  $rejected = $false
  try { & $builder -OutputPath (Join-Path $source 'public.zip') | Out-Null } catch { $rejected = $true }
  Assert-Policy $rejected 'Public root archive path was accepted'
  Assert-Policy (-not (Test-Path -LiteralPath (Join-Path $source 'public.zip'))) 'Rejected package left a public archive'
  [IO.File]::WriteAllText((Join-Path $source 'assets/private.json'), 'PRIVATE FIXTURE')
  $rejected = $false
  try { & $builder -OutputPath (Join-Path $temporary 'poisoned.zip') | Out-Null } catch { $rejected = $true }
  Assert-Policy $rejected 'Private JSON in public assets was packaged'

  # Reader filters entry basenames at each level; EntryFilter includes bypass excludes.
  # Match the recursive traversal, not just one full relative path against a glob.
  $yaml = Get-OneSCanonicalText (Join-Path $root '_config.yml')
  $includes = @([regex]::Matches(($yaml -split 'exclude:')[0], "(?m)^  - '([^']+)'$") | ForEach-Object { $_.Groups[1].Value })
  function Included-InPages([string]$Name) {
    foreach ($entry in ($Name -split '/')) {
      if (@($includes | Where-Object { $entry -clike $_ -or $entry.StartsWith($_, [StringComparison]::Ordinal) }).Count -eq 0) { return $false }
    }
    return $true
  }
  foreach ($page in (Get-OneSPublicPages)) { Assert-Policy (Included-InPages $page) "Static page missing: $page" }
  foreach ($name in @('assets','assets/vendor/purify-3.4.16.min.js','admin.css','profile-orders.js')) { Assert-Policy (Included-InPages $name) "Static asset missing: $name" }
  $publicAssets = @(Get-ChildItem -LiteralPath (Join-Path $root 'assets') -Recurse -File | ForEach-Object { $_.FullName.Substring($root.Length).TrimStart([char[]]'\/').Replace('\','/') } | Where-Object { $_ -ne 'assets/vendor/DOMPurify-LICENSE' })
  foreach ($asset in $publicAssets) { Assert-Policy (Included-InPages $asset) "Public asset missing from static preview: $asset" }
  foreach ($name in @('api.php','config.local.php','admin.js.bak','index.html.old','web.config','README.md','tests/audit/report.html','deployment-old/index.html','ones.zip','.env','data/ones.sqlite','vendor/phpmailer/src/SMTP.php','assets/private.json','assets/private.php','assets/.env','assets/ones-logo.webp.bak','assets/vendor/purify-3.4.16.min.js.bak','assets/vendor/DOMPurify-LICENSE')) { Assert-Policy (-not (Included-InPages $name)) "Private static preview entry: $name" }
  Assert-Policy ($yaml -match "exclude:\s+- '\*'\s+- '\*\*/\*'") 'Pages must exclude everything not explicitly included'

  foreach ($file in @('web.config','data/web.config')) {
    [xml]$xml = [IO.File]::ReadAllText((Join-Path $root $file))
    $verbs = $xml.SelectSingleNode('/configuration/system.webServer/security/requestFiltering/verbs')
    Assert-Policy ($null -ne $verbs -and $verbs.allowUnlisted -ceq 'false' -and $verbs.applyToWebDAV -ceq 'true') "$file must deny all unlisted HTTP verbs, including WebDAV"
    Assert-Policy ($verbs.SelectNodes('clear').Count -eq 1 -and $verbs.SelectNodes('add').Count -eq 0) "$file must clear inherited allows and add none"
  }
  Write-Output "Deployment policy: $checks checks (actual ZIP hashes, CSS-only rebuild, private files, output path, assets, Pages allowlist and IIS rejection guard)."
} finally {
  $resolved = [IO.Path]::GetFullPath($temporary)
  if ((Split-Path -Parent $resolved) -ne ([IO.Path]::GetTempPath().TrimEnd([char[]]'\/')) -or (Split-Path -Leaf $resolved) -notlike 'ones-deploy-policy-*') { throw 'Unsafe cleanup target' }
  if (@(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Refusing recursive cleanup of reparse points' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
