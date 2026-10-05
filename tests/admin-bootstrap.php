<?php
declare(strict_types=1);
require_once __DIR__ . '/database-fixture.php';
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['HTTP_USER_AGENT'] = 'oneS-bootstrap-test';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$checks = 0;
function bootstrap_check(bool $condition, string $message): void {
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
$config = ['database' => ['driver' => 'sqlite', 'sqlite_path' => ':memory:'], 'security' => ['initial_admin_password' => '']];
$isLocalHost = true;
$pdo = test_database($config);
$admin = $pdo->query('SELECT * FROM users WHERE role = "admin"')->fetch();
bootstrap_check(verify_admin_password('onesadmin', $admin), 'Local demo setup must remain possible');
bootstrap_check(admin_password_change_required($pdo, (int)$admin['id']), 'Local demo must be restricted');
establish_auth_session('admin', $admin, auth_epoch($pdo));
$demoSession = $_SESSION;
$backup = backup_payload($pdo);
bootstrap_check(is_array(normalize_backup_payload($backup)), 'Local demo backup must be migratable');
$isLocalHost = false;
foreach (['', 'onesadmin', 'PROMIJENI-U-JAKU-LOZINKU', 'aaaaaaaaaaaaaaa'] as $unsafe) {
    $config['security']['initial_admin_password'] = $unsafe;
    bootstrap_check(!verify_admin_password('onesadmin', $admin), 'Demo credential accepted in production');
    bootstrap_check(!verify_admin_password($unsafe, $admin), 'Unsafe recovery credential accepted');
}
$recovery = 'Private recovery password 2026!';
$config['security']['initial_admin_password'] = $recovery;
bootstrap_check(!verify_admin_password('onesadmin', $admin), 'Configured recovery must not enable demo credential');
bootstrap_check(verify_admin_password($recovery, $admin), 'Owner recovery credential rejected');
bootstrap_check(!verify_admin_password($recovery, null), 'Missing admin accepted');
bootstrap_check(admin_session_active($pdo) && admin_password_change_required($pdo, (int)$admin['id']), 'Existing demo session bypassed restriction');
try {
    normalize_backup_payload($backup);
    throw new RuntimeException('Production accepted a demo backup');
} catch (InvalidArgumentException $expected) {
    bootstrap_check(strpos($expected->getMessage(), 'demonstracijsku') !== false, 'Wrong backup rejection');
}
$pdo->prepare('UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?')
    ->execute([hash_password('Permanent administrator password 2026!'), $admin['id']]);
$admin = $pdo->query('SELECT * FROM users WHERE role = "admin"')->fetch();
bootstrap_check(!admin_password_change_required($pdo, (int)$admin['id']), 'Changed admin remains restricted');
bootstrap_check(verify_admin_password('Permanent administrator password 2026!', $admin), 'Permanent credential rejected');
bootstrap_check(!verify_admin_password($recovery, $admin), 'Recovery bypassed permanent credential');
$_SESSION = $demoSession;
bootstrap_check(!admin_session_active($pdo), 'Old restricted session survived password change');
bootstrap_check(is_array(normalize_backup_payload(backup_payload($pdo))), 'Safe production backup rejected');
bootstrap_check(admin_hash_uses_demo_password(hash_password('PROMIJENI-U-JAKU-LOZINKU')), 'Example placeholder not recognized');
echo "Admin bootstrap checks passed: $checks\n";
