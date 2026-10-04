<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';

$checks = 0;
function xss_check(bool $ok, string $message): void {
    global $checks;
    if (!$ok) { throw new RuntimeException($message); }
    $checks++;
}
$payloads = [
    '<img src=x /onerror="window.__auditXss=1">',
    '<svg/onload=window.__auditXss=1>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=window.__auditXss=1>">',
    '<a href="jav&#x61;script:window.__auditXss=1">link</a>',
    '<a href="java&#9;script:window.__auditXss=1">link</a>',
    '<div onclick="window.__auditXss=1" style="background:url(javascript:alert(1))">text</div>',
    '<form><input name="attributes"><button formaction="javascript:alert(1)">go</button></form>',
    '<template><img src=x onerror=window.__auditXss=1></template>',
    '<iframe srcdoc="<script>window.__auditXss=1</script>"></iframe>',
];
$sanitized = [];
foreach ($payloads as $payload) {
    $html = cms_sanitize_rich_html($payload);
    xss_check(!preg_match('/<(img|svg|math|script|style|form|input|button|iframe|template)\b|\son\w+=|href=["\']javascript:/i', $html), 'Unsafe rich HTML survived: ' . $html);
    $sanitized[] = $html;
}
$format = '<p>Čuvaj <strong>tekst</strong> i <em>stil</em>.</p><ul><li>Stavka</li></ul><font size="5">Naslov</font><a href="https://example.invalid/help?a=1&amp;b=2">Pomoć</a>';
$clean = cms_sanitize_rich_html($format);
foreach (['Čuvaj', '<strong>tekst</strong>', '<em>stil</em>', '<li>Stavka</li>', 'size="5"', 'https://example.invalid/help'] as $part) {
    xss_check(strpos($clean, $part) !== false, 'Formatting lost: ' . $part);
}
foreach (['x" onerror="window.__auditXss=1', "x' onerror='alert(1)", 'javascript:alert(1)', "java\tscript:alert(1)", '//example.invalid/a', '../config.local.php', '%2e%2e/config.local.php', 'https:\\example.invalid'] as $path) {
    $cms = default_cms();
    $cms['products'][0]['image'] = $path;
    xss_check((bool)cms_validate_payload($cms), 'Unsafe asset accepted: ' . $path);
}
foreach (['uploads/products/a.webp', '/assets/a.png', 'https://example.invalid/a.webp?q=1&v=2'] as $path) {
    xss_check(cms_safe_asset_reference($path), 'Safe asset rejected: ' . $path);
}
$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('CREATE TABLE cms_store (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT, revision INTEGER)');
$pdo->exec('CREATE TABLE cms_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER, value TEXT, created_at TEXT)');
$cms = default_cms();
$cms['products'][0]['detailedDescription'] = $payloads[0];
$cms['blogs'][0]['text'] = $payloads[1];
$pdo->prepare('INSERT INTO cms_store VALUES ("cms", ?, "", 1)')->execute([json_encode($cms)]);
xss_check(get_cms($pdo)['products'][0]['detailedDescription'] === '', 'Legacy read is not sanitized');
save_cms($pdo, $cms, 1);
$stored = json_decode($pdo->query('SELECT value FROM cms_store')->fetchColumn(), true);
xss_check($stored['products'][0]['detailedDescription'] === '' && $stored['blogs'][0]['text'] === '', 'Write is not sanitized');
if (in_array('--json', $argv, true)) {
    echo json_encode(['cms' => default_cms(), 'payloads' => $payloads, 'sanitized' => $sanitized, 'format' => $format], JSON_UNESCAPED_UNICODE);
} else {
    echo "CMS XSS checks passed: $checks\n";
}
