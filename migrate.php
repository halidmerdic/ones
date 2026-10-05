<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (PHP_VERSION_ID < 80500) { fwrite(STDERR, "Migracija zahtijeva PHP 8.5 ili noviji.\n"); exit(1); }

$options = [];
foreach (array_slice($argv, 1) as $argument) {
    if (str_starts_with($argument, '--config=')) $options['config'] = substr($argument, 9);
    elseif (in_array($argument, ['--check', '--development', '--help'], true)) $options[substr($argument, 2)] = true;
    else { fwrite(STDERR, "Nepoznata opcija. Koristite --help.\n"); exit(1); }
}
if (isset($options['help'])) {
    echo "php migrate.php --config=/absolute/path/config.php [--check] [--development]\n";
    echo "Prije nadogradnje zaustavite web upise i napravite backup. --check ne mijenja bazu.\n";
    echo "--development dozvoljava lokalnu SQLite demo lozinku; nikada za produkciju.\n";
    exit;
}
$path = realpath((string)($options['config'] ?? ''));
if (!$path || !is_file($path)) { fwrite(STDERR, "Obavezan je --config sa postojećim PHP config fajlom.\n"); exit(1); }
define('ONES_MIGRATION_CONFIG_PATH', $path);
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/api.php';
require __DIR__ . '/schema-migrations.php';
try {
    if (!is_array($config)) throw new RuntimeException('Config mora vratiti niz.');
    $development = isset($options['development']);
    if ($development && ($config['database']['driver'] ?? '') !== 'sqlite') throw new RuntimeException('--development je samo za lokalni SQLite.');
    $pdo = database_connect($config, !isset($options['check']));
    if (isset($options['check'])) require_database_schema($pdo);
    else migrate_database($pdo, $config, $development);
    echo 'Schema version ' . ONES_SCHEMA_VERSION . " ready.\n";
} catch (DatabaseMigrationRequired $error) {
    fwrite(STDERR, $error->getMessage() . "\n"); exit(2);
} catch (Throwable $error) {
    fwrite(STDERR, 'Migracija nije završena: ' . $error->getMessage() . "\n"); exit(1);
}
