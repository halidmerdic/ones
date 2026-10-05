<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/../schema-migrations.php';

// Test setup is explicit; web database() never creates or upgrades a schema.
function test_database(array $settings): PDO
{
    $pdo = database_connect($settings, true);
    migrate_database($pdo, $settings, (bool)($GLOBALS['isLocalHost'] ?? true));
    return $pdo;
}
