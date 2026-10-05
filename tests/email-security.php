<?php
declare(strict_types=1);
require_once __DIR__ . '/database-fixture.php';
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['HTTP_USER_AGENT'] = 'email-security-test';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$checks = 0;
function email_check(bool $ok, string $message): void { global $checks; if (!$ok) throw new RuntimeException($message); $checks++; }
function email_rejected(callable $run, int $status = 400): void {
    try { $run(); throw new RuntimeException('Expected rejection'); }
    catch (EmailFlowError $error) { email_check($error->status === $status, $error->getMessage()); }
}
$config = ['database' => ['driver' => 'sqlite', 'sqlite_path' => ':memory:'], 'security' => ['initial_admin_password' => 'Secure email test admin 2026!']];
if (getenv('ONES_TEST_MYSQL_PORT')) {
    $db = getenv('ONES_TEST_MYSQL_DATABASE') ?: 'ones_segment_test4';
    if (!preg_match('/^ones_segment_test[0-9]*$/D', $db)) throw new RuntimeException('Disposable database required');
    $config['database'] = ['driver' => 'mysql', 'host' => '127.0.0.1', 'port' => getenv('ONES_TEST_MYSQL_PORT'), 'name' => $db, 'user' => 'root', 'password' => ''];
}
$isLocalHost = true;
$pdo = test_database($config);
email_check((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 1, 'Fresh test database only');
function test_challenge(PDO $pdo, string $kind, string $email, ?array $user = null, array $changes = []): string {
    $token = bin2hex(random_bytes(32));
    $row = ['token_hash' => hash('sha256', $token), 'kind' => $kind, 'user_id' => $user['id'] ?? 0, 'email' => $email, 'old_email' => $user['email'] ?? '', 'name' => 'Test customer', 'auth_version' => $user['auth_version'] ?? 0, 'auth_epoch' => auth_epoch($pdo), 'created_at' => time(), 'expires_at' => time() + 1800, 'sent' => 1];
    $row = array_replace($row, $changes);
    insert_rows($pdo, 'email_challenges', [$row]);
    return $token;
}
$pw = 'Sigurna čćšđž lozinka 2026';
$token = test_challenge($pdo, 'signup', 'first@example.invalid');
email_check((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 1, 'Pending registration creates no user or session');
email_rejected(fn() => confirm_customer_email($pdo, $token, str_repeat('č', 8), null));
email_check((int)$pdo->query('SELECT COUNT(*) FROM email_challenges')->fetchColumn() === 1, 'Password validation does not consume token');
$user = confirm_customer_email($pdo, $token, $pw, null);
email_check(email_is_verified($pdo, $user['id'], $user['email']), 'Mailbox confirmed');
email_rejected(fn() => confirm_customer_email($pdo, $token, $pw, null));
email_check(password_verify($pw, (string)$pdo->query('SELECT password_hash FROM users WHERE id = ' . (int)$user['id'])->fetchColumn()), 'Mailbox owner chooses password');
foreach ([['expires_at' => time() - 1], ['auth_epoch' => str_repeat('a', 64)], ['sent' => 0]] as $changes) {
    $bad = test_challenge($pdo, 'signup', uniqid() . '@example.invalid', null, $changes);
    email_rejected(fn() => confirm_customer_email($pdo, $bad, $pw, null));
}
$change = test_challenge($pdo, 'change', 'new@example.invalid', $user);
email_rejected(fn() => confirm_customer_email($pdo, $change, '', null), 401);
email_rejected(fn() => confirm_customer_email($pdo, $change, '', 999), 401);
email_check(customer_email_details($pdo, $user['id'], $user['email'])['pendingEmail'] === 'new@example.invalid', 'Pending new email visible');
$newUser = confirm_customer_email($pdo, $change, '', $user['id']);
email_check($newUser['email'] === 'new@example.invalid' && $newUser['auth_version'] === 1, 'Confirmation changes email and revokes other sessions');
email_check(!email_is_verified($pdo, $user['id'], $user['email']) && email_is_verified($pdo, $user['id'], $newUser['email']), 'Verification bound to exact current address');
$change = test_challenge($pdo, 'change', 'later@example.invalid', $newUser);
$pdo->exec('UPDATE users SET auth_version = auth_version + 1 WHERE id = ' . (int)$user['id']);
email_rejected(fn() => confirm_customer_email($pdo, $change, '', $user['id']));
email_check(customer_email_details($pdo, $user['id'], $newUser['email'])['pendingEmail'] === '', 'Password change invalidates pending display');
$collision = test_challenge($pdo, 'signup', 'new@example.invalid');
email_rejected(fn() => confirm_customer_email($pdo, $collision, $pw, null), 409);
email_check((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 2, 'Collision cannot overwrite account');

// Authenticated legacy profiles stay readable, but cannot submit unverified identities.
$pdo->exec('DELETE FROM customer_email_state');
$cartId = active_cart_id($pdo, $user['id']);
add_cart_item($pdo, $cartId, 'scooter-f3', 1);
email_rejected(fn() => create_order_from_cart($pdo, $user['id'], $cartId, $newUser, '061123456', '', false), 403);
email_check(cart_payload_by_id($pdo, $user['id'], $cartId)['count'] === 1, 'Denied order preserves cart');
$newUser['auth_version'] = 2;
$verify = test_challenge($pdo, 'verify', $newUser['email'], $newUser);
$verifiedUser = confirm_customer_email($pdo, $verify, '', $newUser['id']);
email_check(create_order_from_cart($pdo, $user['id'], $cartId, $verifiedUser, '061123456', '', false) > 0, 'Verified profile can submit');

email_rejected(fn() => email_delivery_config(), 503);
$config['mail'] = ['host' => '127.0.0.1', 'port' => 10255, 'encryption' => 'none', 'from_address' => 'sender@example.invalid', 'public_url' => 'http://127.0.0.1:18765'];
email_check(email_delivery_config()['encryption'] === 'none', 'Loopback-only test transport allowed');
$isLocalHost = false;
email_rejected(fn() => email_delivery_config(), 503);
$config['mail'] = ['host' => 'smtp.example.invalid', 'port' => 587, 'encryption' => 'tls', 'username' => 'test', 'password' => 'test', 'from_address' => 'sender@example.invalid', 'public_url' => 'https://ones.ba'];
email_check(email_delivery_config()['public_url'] === 'https://ones.ba', 'Explicit production TLS config');
foreach (['http://ones.ba', 'https://user@ones.ba', 'https://ones.ba/#token=x', 'https://ones.ba/?x=1'] as $url) {
    $config['mail']['public_url'] = $url;
    email_rejected(fn() => email_delivery_config(), 503);
}
$isLocalHost = true;
$pdo->exec("DELETE FROM request_limits WHERE action LIKE 'email-send-%'");
email_transaction($pdo);
reserve_email_budget($pdo, 'rate@example.invalid', '127.0.0.1', 100000);
$pdo->commit();
email_transaction($pdo);
email_rejected(fn() => reserve_email_budget($pdo, 'rate@example.invalid', 'different-ip', 100010), 429);
$pdo->rollBack();
email_check((int)$pdo->query("SELECT COUNT(*) FROM request_limits WHERE action LIKE 'email-send-%'")->fetchColumn() === 4, 'Blocked resend does not extend counters');
foreach ([100061, 100122] as $now) { email_transaction($pdo); reserve_email_budget($pdo, 'rate@example.invalid', 'different-ip', $now); $pdo->commit(); }
email_transaction($pdo);
email_rejected(fn() => reserve_email_budget($pdo, 'rate@example.invalid', 'third-ip', 100183), 429);
$pdo->rollBack();

$backup = backup_payload($pdo);
email_check(!isset($backup['tables']['email_challenges'], $backup['tables']['customer_email_state']), 'No bearer tokens or verification claims exported');
$directory = sys_get_temp_dir() . '/ones-email-restore-' . bin2hex(random_bytes(8));
try {
    restore_backup_payload($pdo, $backup, $directory);
    email_check((int)$pdo->query('SELECT COUNT(*) FROM email_challenges')->fetchColumn() === 0, 'Restore cancels pending tokens');
    email_check(!email_is_verified($pdo, $user['id'], $newUser['email']), 'Restored identity requires fresh mailbox proof');
} finally { foreach (glob($directory . '/*') ?: [] as $file) unlink($file); if (is_dir($directory)) rmdir($directory); }
echo "Email security checks passed: $checks (" . database_driver($pdo) . ")\n";
