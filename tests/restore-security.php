<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['HTTP_USER_AGENT'] = 'oneS-restore-test';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$checks = 0;
function restore_check(bool $ok, string $message): void {
    global $checks;
    if (!$ok) { throw new RuntimeException($message); }
    $checks++;
}
$config = ['database' => ['driver' => 'sqlite', 'sqlite_path' => ':memory:'], 'security' => ['initial_admin_password' => 'Restore test password 2026!']];
$isLocalHost = true;
$pdo = database($config);
$pdo->prepare('INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)')
    ->execute(['Customer A', 'a@example.invalid', hash_password('Customer A password 2026!'), 'customer', date('c')]);
$customer = $pdo->query('SELECT * FROM users WHERE role = "customer"')->fetch();
$admin = $pdo->query('SELECT * FROM users WHERE role = "admin"')->fetch();
establish_auth_session('customer', $customer, auth_epoch($pdo));
establish_auth_session('admin', $admin, auth_epoch($pdo));
$oldSession = $_SESSION;
$oldEpoch = auth_epoch($pdo);
$backup = backup_payload($pdo);
restore_check(!isset($backup['tables']['auth_state']) && strpos(json_encode($backup), $oldEpoch) === false, 'Backup exported the session epoch');
foreach ($backup['tables']['users'] as &$user) {
    if ($user['role'] === 'customer') {
        $user['name'] = 'Customer B';
        $user['email'] = 'b@example.invalid';
        $user['password_hash'] = hash_password('Customer B password 2026!');
    }
}
unset($user);
$backupDirectory = sys_get_temp_dir() . '/ones-restore-test-' . bin2hex(random_bytes(8));
try {
    restore_backup_payload($pdo, $backup, $backupDirectory);
    restore_check(auth_epoch($pdo) !== $oldEpoch, 'Restore did not change session epoch');
    $_SESSION = $oldSession;
    restore_check(!customer_session_active($pdo), 'Old customer session became another user');
    $_SESSION = $oldSession;
    restore_check(!admin_session_active($pdo), 'Old admin session survived');
    establish_auth_session('customer', $customer, $oldEpoch);
    restore_check(!customer_session_active($pdo), 'Concurrent pre-restore login acquired restored identity');
    $newCustomer = $pdo->query('SELECT * FROM users WHERE role = "customer"')->fetch();
    establish_auth_session('customer', $newCustomer, auth_epoch($pdo));
    restore_check(customer_session_active($pdo), 'Fresh login after restore failed');
    $newSession = $_SESSION;
    restore_backup_payload($pdo, $backup, $backupDirectory);
    $_SESSION = $newSession;
    restore_check(!customer_session_active($pdo), 'Repeated restore reused generation');
    $_SESSION = $oldSession;
    restore_check(!customer_session_active($pdo), 'Repeated restore revived oldest session');
    establish_auth_session('admin', $admin, auth_epoch($pdo));
    unset($_SESSION['admin_auth_epoch']);
    restore_check(!admin_session_active($pdo), 'Legacy session without epoch accepted');
    echo "Restore session checks passed: $checks\n";
} finally {
    foreach (glob($backupDirectory . '/pre-restore-*.json') as $file) {
        unlink($file);
    }
    if (is_dir($backupDirectory)) rmdir($backupDirectory);
}
