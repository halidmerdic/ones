<?php
declare(strict_types=1);
require __DIR__ . '/strict-errors.php';
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$db = ['driver' => 'sqlite', 'sqlite_path' => $input['path']];
if (getenv('ONES_TEST_MYSQL_PORT')) {
    $name = getenv('ONES_TEST_MYSQL_DATABASE');
    if (!preg_match('/^ones_segment_test[0-9]+$/D', (string)$name)) throw new RuntimeException('Disposable DB required');
    $db = ['driver' => 'mysql', 'host' => '127.0.0.1', 'port' => getenv('ONES_TEST_MYSQL_PORT'), 'name' => $name, 'user' => 'root', 'password' => ''];
}
if ($input['action'] === 'init') {
    $pdo = database(['database' => $db, 'security' => ['initial_admin_password' => 'CMS concurrency admin 2026!']]);
    if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 1 || get_cms_revision($pdo) !== 1) throw new RuntimeException('Fresh DB required');
} else {
    $pdo = $db['driver'] === 'sqlite' ? new PDO('sqlite:' . $db['sqlite_path']) : new PDO('mysql:host=127.0.0.1;port=' . $db['port'] . ';dbname=' . $db['name'] . ';charset=utf8mb4', 'root', '', [PDO::ATTR_EMULATE_PREPARES => false]);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    if ($db['driver'] === 'sqlite') { $pdo->exec('PRAGMA busy_timeout = 15000'); $pdo->exec('PRAGMA foreign_keys = ON'); }
}
try {
    if ($input['action'] === 'save') {
        $result = save_cms($pdo, $input['cms'], $input['revision'], $input['deletedProductIds'] ?? []);
    } else {
        $result = ['cms' => admin_cms_view($pdo), 'revision' => get_cms_revision($pdo), 'history' => (int)$pdo->query('SELECT COUNT(*) FROM cms_revisions')->fetchColumn()];
    }
    echo json_encode(['ok' => true, 'result' => $result]);
} catch (CmsRevisionConflict $error) {
    echo json_encode(['ok' => false, 'conflict' => true, 'transactionOpen' => $pdo->inTransaction()]);
} catch (CmsValidationError $error) {
    echo json_encode(['ok' => false, 'invalid' => true, 'transactionOpen' => $pdo->inTransaction()]);
}
