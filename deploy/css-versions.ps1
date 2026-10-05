Set-StrictMode -Version Latest

function Get-OneSCanonicalText([string]$Path) {
  return [IO.File]::ReadAllText($Path).Replace("`r`n", "`n").Replace("`r", "`n")
}

function Get-OneSStylesheetVersions([string]$Root) {
  $versions = @{}
  foreach ($name in @('styles.css','admin.css','cms-relations.css','admin-feedback.css','admin-responsive.css','verify.css')) {
    $bytes = [Text.Encoding]::UTF8.GetBytes((Get-OneSCanonicalText (Join-Path $Root $name)))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $versions[$name] = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant().Substring(0,16) }
    finally { $sha.Dispose() }
  }
  return $versions
}

function Update-OneSStylesheetReferences([string]$Html, [hashtable]$Versions) {
  $pattern = '(?<prefix>href=["''])(?<file>[^"''?#]+\.css)(?:\?[^"''#]*)?(?<fragment>#[^"'']*)?(?<suffix>["''])'
  return [regex]::Replace($Html, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($match)
    $name = $match.Groups['file'].Value
    if (-not $Versions.ContainsKey($name)) { throw "Nepoznat stylesheet: $name" }
    return $match.Groups['prefix'].Value + $name + '?v=' + $Versions[$name] + $match.Groups['fragment'].Value + $match.Groups['suffix'].Value
  })
}

function Get-OneSPublicPages {
  return @('index.html','admin.html','blog.html','cart.html','login.html','privacy.html','product.html','profile.html','terms.html','verify.html')
}
