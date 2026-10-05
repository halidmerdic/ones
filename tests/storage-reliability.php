<?php
declare(strict_types=1);
require_once __DIR__ . '/database-fixture.php';

ini_set('session.save_path', sys_get_temp_dir());
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';

$checks = 0;
$databasePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ones-storage-' . bin2hex(random_bytes(6)) . '.sqlite';
$atomicPath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ones-atomic-' . bin2hex(random_bytes(6)) . '.txt';

function assert_storage_test(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        fwrite(STDERR, 'FAILED: ' . $message . PHP_EOL);
        exit(1);
    }
    $checks++;
}

try {
    $config = [
        'database' => [
            'driver' => 'sqlite',
            'sqlite_path' => $databasePath,
        ],
        'security' => [
            'initial_admin_password' => 'Sigurna admin lozinka 2026',
        ],
    ];
    $isLocalHost = true;

    $legacyPdo = new PDO('sqlite:' . $databasePath);
    $legacyPdo->exec('CREATE TABLE cms_store (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)');
    $legacyInsert = $legacyPdo->prepare('INSERT INTO cms_store (key, value, updated_at) VALUES ("cms", :value, :updated_at)');
    $legacyInsert->execute([':value' => encode_json_or_fail(default_cms(), true), ':updated_at' => date('c')]);
    unset($legacyInsert);
    $legacyPdo = null;

    $pdo = test_database($config);

    assert_storage_test(has_column($pdo, 'cms_store', 'revision'), 'postojeća CMS tabela dobija broj revizije bez gubitka podataka');
    assert_storage_test((bool)$pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cms_revisions'")->fetchColumn(), 'baza sadrži historiju CMS revizija');
    assert_storage_test(get_cms_revision($pdo) === 1, 'novi CMS počinje prvom revizijom');
    assert_storage_test((int)$pdo->query('PRAGMA busy_timeout')->fetchColumn() === 5000, 'SQLite čeka kratko na zauzetu bazu');

    $cms = get_cms($pdo);
    $cms['contact']['email'] = 'revision-test@ones.local';
    $revision = save_cms($pdo, $cms, 1);
    assert_storage_test($revision === 2, 'uspješno spremanje povećava reviziju');
    assert_storage_test(get_cms($pdo)['contact']['email'] === 'revision-test@ones.local', 'CMS promjena je sačuvana');
    assert_storage_test((int)$pdo->query('SELECT COUNT(*) FROM cms_revisions')->fetchColumn() === 1, 'prethodna CMS verzija je sačuvana');

    $conflictDetected = false;
    try {
        save_cms($pdo, default_cms(), 1);
    } catch (CmsRevisionConflict $error) {
        $conflictDetected = true;
    }
    assert_storage_test($conflictDetected, 'zastarjelo spremanje se odbija');
    assert_storage_test(get_cms($pdo)['contact']['email'] === 'revision-test@ones.local', 'odbijeno spremanje ne mijenja CMS');

    for ($index = 0; $index < 30; $index++) {
        $cms['contact']['email'] = 'revision-' . $index . '@ones.local';
        $revision = save_cms($pdo, $cms, $revision);
    }
    assert_storage_test((int)$pdo->query('SELECT COUNT(*) FROM cms_revisions')->fetchColumn() === 25, 'historija čuva posljednjih 25 CMS verzija');

    $backup = backup_payload($pdo);
    [$backupValid, $backupMessage] = validate_backup_payload($backup);
    assert_storage_test($backupValid && $backup['version'] === 3 && $backup['cmsRevision'] === $revision, 'backup sadrži ispravan CMS i reviziju: ' . $backupMessage);

    $invalidBackup = $backup;
    $invalidBackup['cms']['products'] = 'nije-lista';
    [$invalidBackupValid] = validate_backup_payload($invalidBackup);
    assert_storage_test(!$invalidBackupValid, 'restore odbija neispravne CMS podatke');

    atomic_write_file($atomicPath, 'oneS atomic test');
    assert_storage_test(file_get_contents($atomicPath) === 'oneS atomic test', 'atomsko zapisivanje objavljuje cijeli fajl');

    echo 'Storage reliability checks passed: ' . $checks . PHP_EOL;
} finally {
    if (is_file($databasePath . '.migration.lock')) unlink($databasePath . '.migration.lock');
    $pdo = null;
    gc_collect_cycles();
    foreach ([$databasePath, $atomicPath] as $path) {
        for ($attempt = 0; $attempt < 5 && is_file($path); $attempt++) {
            if (@unlink($path)) {
                break;
            }
            usleep(50000);
        }
    }
}
