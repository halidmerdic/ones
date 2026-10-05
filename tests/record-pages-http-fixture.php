<?php
declare(strict_types=1);
// Seeds only the task's explicitly disposable HTTP package, never a project/live database.
if (PHP_SAPI !== 'cli' || getenv('ONES_DISPOSABLE_TEST') !== '1') exit(1);
$configPath = realpath((string)($argv[1] ?? ''));
$fixture = realpath(__DIR__ . '/../.runtime/segment12-tests/web');
if (!$fixture || $configPath !== $fixture . DIRECTORY_SEPARATOR . 'config.local.php') throw new RuntimeException('Use the segment12 disposable package.');
define('ONES_MIGRATION_CONFIG_PATH', $configPath);
define('ONES_API_LIBRARY_ONLY', true);
$_SERVER['HTTP_HOST'] = 'localhost';
require __DIR__ . '/../api.php';
require __DIR__ . '/record-page-data.php';
$db = $config['database'];
if (($db['driver'] ?? '') === 'sqlite') {
    $path = realpath($db['sqlite_path']);
    if (!$path || !str_starts_with($path, $fixture . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR)) throw new RuntimeException('Unsafe SQLite target.');
} elseif (($db['driver'] ?? '') !== 'mysql' || ($db['host'] ?? '') !== '127.0.0.1' || (int)($db['port'] ?? 0) !== 13316 || !preg_match('/^ones_segment_test[0-9]+$/D', $db['name'] ?? '')) {
    throw new RuntimeException('Unsafe database target.');
}
$pdo = database($config);
if ((int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn() !== 0 || (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 1) throw new RuntimeException('Fresh migrated fixture required.');
seed_record_page_data($pdo);
echo "HTTP fixture: 130 customers / 464 orders.\n";
