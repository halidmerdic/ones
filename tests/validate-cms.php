<?php
declare(strict_types=1);

ini_set('session.save_path', sys_get_temp_dir());
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';

$pdo = new PDO('sqlite:' . __DIR__ . '/../data/ones.sqlite');
$rawCms = $pdo->query('SELECT value FROM cms_store WHERE "key" = "cms"')->fetchColumn();
$storedCms = json_decode((string)$rawCms, true);
if (!is_array($storedCms)) {
    fwrite(STDERR, "CMS JSON is invalid.\n");
    exit(1);
}
$defaults = default_cms();
$cms = array_replace($defaults, $storedCms);
$cms['contact'] = array_replace($defaults['contact'], is_array($storedCms['contact'] ?? null) ? $storedCms['contact'] : []);
$cms['sections'] = array_replace($defaults['sections'], is_array($storedCms['sections'] ?? null) ? $storedCms['sections'] : []);
$cms['settings'] = array_replace($defaults['settings'], is_array($storedCms['settings'] ?? null) ? $storedCms['settings'] : []);
$errors = cms_validate_payload($cms);

if ($errors) {
    fwrite(STDERR, implode(PHP_EOL, $errors) . PHP_EOL);
    exit(1);
}

function assert_invalid_cms(array $cms, string $expectedFragment): void
{
    $errors = cms_validate_payload($cms);
    foreach ($errors as $error) {
        if (strpos($error, $expectedFragment) !== false) {
            return;
        }
    }
    fwrite(STDERR, 'Expected validation error containing: ' . $expectedFragment . PHP_EOL);
    exit(1);
}

$invalidCms = $cms;
$invalidCms['products'][1]['id'] = $invalidCms['products'][0]['id'];
assert_invalid_cms($invalidCms, 'jedinstven ID proizvoda');

$invalidCms = $cms;
$invalidCms['products'][0]['category'] = 'Nepostojeća kategorija';
assert_invalid_cms($invalidCms, 'postojeću kategoriju');

$invalidCms = $cms;
$invalidCms['products'][0]['detailedDescription'] = '<script>alert(1)</script>';
assert_invalid_cms($invalidCms, 'nedozvoljen HTML');

$invalidCms = $cms;
$invalidCms['products'][0]['salePrice'] = '1';
$invalidCms['products'][0]['saleUntil'] = '';
assert_invalid_cms($invalidCms, 'obavezan kada postoji akcijska cijena');

$publicCms = public_cms($cms);
if (isset($publicCms['launchChecklist']) || isset($publicCms['contact']['orderMessageTemplate'])) {
    fwrite(STDERR, "Public CMS exposes administrator-only data.\n");
    exit(1);
}

echo "Existing CMS data and rejection cases pass server validation.\n";
