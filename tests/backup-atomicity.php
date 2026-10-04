<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['HTTP_USER_AGENT'] = 'oneS-backup-test';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$checks = 0;
function backup_check(bool $ok, string $message): void {
    global $checks;
    if (!$ok) throw new RuntimeException($message);
    $checks++;
}
function backup_test_snapshot(PDO $pdo): array {
    $result = [];
    foreach (['cms_store', 'cms_revisions', 'users', 'carts', 'cart_items', 'product_favorites', 'orders', 'auth_state'] as $table) {
        $result[$table] = table_rows($pdo, $table);
    }
    return $result;
}
$config = ['database' => ['driver' => 'sqlite', 'sqlite_path' => ':memory:'], 'security' => ['initial_admin_password' => 'Atomic backup password 2026!']];
if (getenv('ONES_TEST_MYSQL_PORT')) {
    $testDatabase = getenv('ONES_TEST_MYSQL_DATABASE') ?: 'ones_segment_test';
    if (!preg_match('/^ones_segment_test[0-9]*$/D', $testDatabase)) {
        throw new RuntimeException('Use an isolated ones_segment_test database.');
    }
    $config['database'] = ['driver' => 'mysql', 'host' => '127.0.0.1', 'port' => getenv('ONES_TEST_MYSQL_PORT'), 'name' => $testDatabase, 'user' => 'root', 'password' => ''];
}
$isLocalHost = true;
$pdo = database($config);
backup_check((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 1
    && (int)$pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn() === 0, 'Use a fresh, disposable test database');
$pdo->prepare('INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)')
    ->execute(['Test customer', 'atomic@example.invalid', hash_password('Atomic customer password 2026!'), 'customer', date('c')]);
$userId = (int)$pdo->lastInsertId();
$cartId = active_cart_id($pdo, $userId);
add_cart_item($pdo, $cartId, 'scooter-f3', 2);
create_order_from_cart($pdo, $userId, $cartId, ['name' => 'Test customer', 'email' => 'atomic@example.invalid'], '061123456', 'Snapshot', false);
$original = backup_payload($pdo);
$backupDirectory = sys_get_temp_dir() . '/ones-atomic-test-' . bin2hex(random_bytes(8));
$before = backup_test_snapshot($pdo);
$cases = [
    'unknown version' => static function (&$b) { $b['version'] = 99; },
    'missing version' => static function (&$b) { unset($b['version']); },
    'empty users' => static function (&$b) { $b['tables']['users'] = []; },
    'admin unavailable' => static function (&$b) { $b['tables']['users'][0]['role'] = 'customer'; },
    'missing hash' => static function (&$b) { unset($b['tables']['users'][0]['password_hash']); },
    'invalid hash' => static function (&$b) { $b['tables']['users'][0]['password_hash'] = 'not-a-hash'; },
    'invalid bcrypt cost' => static function (&$b) { $b['tables']['users'][0]['password_hash'] = '$2y$99$' . str_repeat('a', 53); },
    'duplicate email' => static function (&$b) { $b['tables']['users'][1]['email'] = $b['tables']['users'][0]['email']; },
    'duplicate id' => static function (&$b) { $b['tables']['users'][1]['id'] = $b['tables']['users'][0]['id']; },
    'invalid role' => static function (&$b) { $b['tables']['users'][1]['role'] = 'owner'; },
    'unknown column' => static function (&$b) { $b['tables']['users'][0]['surprise'] = 1; },
    'unknown table' => static function (&$b) { $b['tables']['auth_state'] = []; },
    'object instead of rows' => static function (&$b) { $b['tables']['users'] = ['named' => $b['tables']['users'][0]]; },
    'scalar row' => static function (&$b) { $b['tables']['users'][0] = 'bad'; },
    'array field' => static function (&$b) { $b['tables']['users'][0]['name'] = []; },
    'invalid date' => static function (&$b) { $b['tables']['users'][0]['created_at'] = '2026-02-30T12:00:00+01:00'; },
    'float id' => static function (&$b) { $b['tables']['users'][0]['id'] = 1.5; },
    'negative auth version' => static function (&$b) { $b['tables']['users'][0]['auth_version'] = -1; },
    'orphan cart' => static function (&$b) { $b['tables']['carts'][0]['user_id'] = 99999; },
    'orphan item' => static function (&$b) { $b['tables']['cart_items'][0]['cart_id'] = 99999; },
    'orphan order' => static function (&$b) { $b['tables']['orders'][0]['user_id'] = 99999; },
    'duplicate item' => static function (&$b) { $r = $b['tables']['cart_items'][0]; $r['id'] = 99999; $b['tables']['cart_items'][] = $r; },
    'invalid quantity' => static function (&$b) { $b['tables']['cart_items'][0]['quantity'] = 100; },
    'invalid order json' => static function (&$b) { $b['tables']['orders'][0]['items_json'] = '{'; },
    'invalid order item' => static function (&$b) { $b['tables']['orders'][0]['items_json'] = '[{"name": []}]'; },
    'invalid order status' => static function (&$b) { $b['tables']['orders'][0]['status'] = 'Unknown'; },
    'CMS object collection' => static function (&$b) { $b['cms']['products'] = ['named' => $b['cms']['products'][0]]; },
    'CMS nested object list' => static function (&$b) { $b['cms']['products'][0]['gallery'] = ['named' => 'assets/a.png']; },
    'CMS array identifier' => static function (&$b) { $b['cms']['products'][0]['id'] = []; },
    'CMS array contact' => static function (&$b) { $b['cms']['contact']['whatsapp'] = []; },
    'malicious asset' => static function (&$b) { $b['cms']['products'][0]['image'] = 'x" onerror="alert(1)'; },
];
try {
    // Reproduce the production failure: no seed password may be needed later.
    $isLocalHost = false;
    $config['security']['initial_admin_password'] = '';
    foreach ($cases as $name => $mutate) {
        $candidate = $original;
        $mutate($candidate);
        [$valid] = validate_backup_payload($candidate);
        backup_check(!$valid, 'Validator accepted: ' . $name);
        $rejected = false;
        try { restore_backup_payload($pdo, $candidate, $backupDirectory); }
        catch (InvalidArgumentException $error) { $rejected = true; }
        backup_check($rejected, 'Direct restore accepted: ' . $name);
        backup_check(backup_test_snapshot($pdo) === $before, 'Invalid backup changed state: ' . $name);
    }
    backup_check(!is_dir($backupDirectory), 'Invalid input wrote a pre-restore file');
    $candidate = $original;
    $candidate['cms']['contact']['email'] = 'restored@example.invalid';
    // Fail late, AFTER CMS and user replacement, to prove real DB rollback.
    $pdo->exec(database_driver($pdo) === 'mysql'
        ? "CREATE TRIGGER reject_restore_order BEFORE INSERT ON orders FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected restore failure'"
        : "CREATE TRIGGER reject_restore_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT, 'Injected restore failure'); END");
    $failed = false;
    try { restore_backup_payload($pdo, $candidate, $backupDirectory); }
    catch (PDOException $error) { $failed = true; }
    backup_check($failed, 'Late DB failure was not triggered');
    backup_check(backup_test_snapshot($pdo) === $before, 'Late error did not roll back every table/revision/epoch');
    backup_check(!$pdo->inTransaction(), 'Failed restore left transaction open');
    $pdo->exec('DROP TRIGGER reject_restore_order');
    $pdo->exec(database_driver($pdo) === 'mysql'
        ? "CREATE TRIGGER reject_restore_epoch AFTER UPDATE ON auth_state FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Injected epoch failure'"
        : "CREATE TRIGGER reject_restore_epoch AFTER UPDATE ON auth_state BEGIN SELECT RAISE(ABORT, 'Injected epoch failure'); END");
    $failed = false;
    try { restore_backup_payload($pdo, $candidate, $backupDirectory); }
    catch (PDOException $error) { $failed = true; }
    backup_check($failed && backup_test_snapshot($pdo) === $before, 'Revocation failure did not roll back restored data');
    $pdo->exec('DROP TRIGGER reject_restore_epoch');
    $blockedDirectory = $backupDirectory . '/not-a-directory';
    file_put_contents($blockedDirectory, 'test');
    $failed = false;
    try { @restore_backup_payload($pdo, $candidate, $blockedDirectory); }
    catch (RuntimeException $error) { $failed = true; }
    backup_check($failed && backup_test_snapshot($pdo) === $before, 'Pre-backup failure changed state');
    unlink($blockedDirectory);
    $revision = restore_backup_payload($pdo, $candidate, $backupDirectory);
    backup_check($revision === $original['cmsRevision'] + 1, 'Successful restore has wrong revision');
    backup_check(get_cms($pdo)['contact']['email'] === 'restored@example.invalid', 'Valid restore failed');
    backup_check(count(table_rows($pdo, 'orders')) === 1 && count(table_rows($pdo, 'users')) === 2, 'Valid restore lost records');
    backup_check(auth_epoch($pdo) !== $before['auth_state'][0]['epoch'], 'Successful restore failed to revoke sessions');
    $files = glob($backupDirectory . '/pre-restore-*.json');
    backup_check(count($files) === 3, 'Pre-restore filenames collided or were lost');
    foreach ($files as $file) {
        $copy = json_decode(file_get_contents($file), true);
        backup_check(validate_backup_payload($copy)[0], 'Safety backup cannot be restored');
        backup_check($copy['cms']['contact']['email'] === $original['cms']['contact']['email'], 'Safety backup not captured before replacement');
    }
    $legacy = $original;
    $legacy['version'] = 1;
    unset($legacy['cmsRevision'], $legacy['tables']['product_favorites']);
    foreach ($legacy['tables']['users'] as &$row) {
        $row['id'] = (string)$row['id'];
        unset($row['auth_version'], $row['privacy_accepted_at'], $row['phone']);
    }
    unset($row, $legacy['tables']['orders'][0]['admin_note']);
    $duplicate = $legacy['tables']['cart_items'][0];
    $duplicate['id'] = 99999;
    $legacy['tables']['cart_items'][] = $duplicate;
    restore_backup_payload($pdo, $legacy, $backupDirectory);
    backup_check((int)$pdo->query('SELECT quantity FROM cart_items')->fetchColumn() === 4, 'Explicit v1 migration failed to merge duplicate rows');
    backup_check((int)$pdo->query('SELECT auth_version FROM users LIMIT 1')->fetchColumn() === 0, 'Explicit v1 defaults failed');
    if (isset($argv[1])) {
        $example = json_decode(file_get_contents($argv[1]), true);
        [$valid, $message] = validate_backup_payload($example);
        backup_check(!$valid && strpos($message, 'carts.user_id') !== false, 'Known legacy example must reject its orphan cart');
        // Use its historical CMS schema to test migration independently of the
        // corrupt cart. The original file is never modified.
        $example['tables']['carts'] = [];
        $example['tables']['cart_items'] = [];
        [$valid, $message] = validate_backup_payload($example);
        backup_check($valid, 'Historical CMS migration failed: ' . $message);
    }
    echo 'Backup atomicity checks passed: ' . $checks . ' (' . database_driver($pdo) . ")\n";
} finally {
    if ($pdo->inTransaction()) $pdo->rollBack();
    $pdo->exec('DROP TRIGGER IF EXISTS reject_restore_order');
    $pdo->exec('DROP TRIGGER IF EXISTS reject_restore_epoch');
    foreach (glob($backupDirectory . '/pre-restore-*.json') as $file) unlink($file);
    if (is_dir($backupDirectory)) rmdir($backupDirectory);
}
