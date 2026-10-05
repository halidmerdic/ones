param([switch]$Check)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'css-versions.ps1')
$root = Split-Path -Parent $PSScriptRoot
$versions = Get-OneSStylesheetVersions $root
$changed = @()
foreach ($name in (Get-OneSPublicPages)) {
  $path = Join-Path $root $name
  $before = Get-OneSCanonicalText $path
  $after = Update-OneSStylesheetReferences $before $versions
  if ($before -cne $after) {
    $changed += $name
    if (-not $Check) { [IO.File]::WriteAllText($path, $after, [Text.UTF8Encoding]::new($false)) }
  }
}
if ($Check -and $changed.Count) { throw "CSS verzije nisu usklađene: $($changed -join ', '). Pokrenite deploy/sync-css.ps1." }
Write-Output "CSS fingerprints: $($versions.Count) stylesheets / $((Get-OneSPublicPages).Count) pages; updated $($changed.Count)."
