<?php
declare(strict_types=1);
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
$checks = 0;
function login_check(bool $ok, string $message): void {
    global $checks;
    if (!$ok) throw new RuntimeException($message);
    $checks++;
}
function expect_throttle(callable $attempt, int $minimum = 1): LoginThrottled {
    try { $attempt(); } catch (LoginThrottled $error) {
        login_check($error->retryAfter >= $minimum, 'Incorrect retry delay');
        return $error;
    }
    throw new RuntimeException('Expected login throttling');
}
$mode = $argv[1] ?? '';
$path = $argv[2] ?? ':memory:';
if ($path !== ':memory:' && (dirname($path) !== sys_get_temp_dir() || !preg_match('/^ones-login-test-[a-z0-9-]+[.]sqlite$/', basename($path)))) {
    throw new RuntimeException('Use an isolated temporary login test database');
}
if (getenv('ONES_TEST_MYSQL_PORT')) {
    $db = getenv('ONES_TEST_MYSQL_DATABASE') ?: 'ones_segment_test';
    if (!preg_match('/^ones_segment_test[0-9]*$/D', $db)) throw new RuntimeException('Invalid disposable database name');
    $pdo = new PDO('mysql:host=127.0.0.1;port=' . getenv('ONES_TEST_MYSQL_PORT') . ';dbname=' . $db, 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES => false]);
} else {
    $pdo = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 20]);
}
if ($mode === '--worker') {
    try {
        reserve_login_attempt($pdo, 'customer', '198.51.100.' . $argv[3], 'same@example.invalid', 2000000000);
        echo json_encode(['accepted' => true]);
    } catch (LoginThrottled $error) { echo json_encode(['accepted' => false, 'retryAfter' => $error->retryAfter]); }
    exit;
}
$pdo->exec(database_driver($pdo) === 'mysql'
    ? 'CREATE TABLE IF NOT EXISTS request_limits (id INT PRIMARY KEY AUTO_INCREMENT, action VARCHAR(80), identifier VARCHAR(190), created_at VARCHAR(64), INDEX(action,identifier,created_at)) ENGINE=InnoDB'
    : 'CREATE TABLE IF NOT EXISTS request_limits (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, identifier TEXT, created_at TEXT)');
initialize_login_limits($pdo);
$pdo->exec('DELETE FROM request_limits');
if ($mode === '--init') exit;
$now = 2000000000;
for ($i = 1; $i <= 5; $i++) reserve_login_attempt($pdo, 'customer', '198.51.100.' . $i, 'Target@Example.invalid ', $now);
$before = (int)$pdo->query('SELECT COUNT(*) FROM request_limits')->fetchColumn();
expect_throttle(fn() => reserve_login_attempt($pdo, 'customer', '203.0.113.200', 'target@example.invalid', $now), 2);
expect_throttle(fn() => reserve_login_attempt($pdo, 'customer', '203.0.113.201', 'TARGET@example.invalid', $now + 1));
login_check((int)$pdo->query('SELECT COUNT(*) FROM request_limits')->fetchColumn() === $before, 'Blocked requests extended cooldown or partially reserved');
$ticket = reserve_login_attempt($pdo, 'customer', '203.0.113.200', 'target@example.invalid', $now + 2);
login_check(count($ticket) === 4, 'Distributed attempt did not resume at retry deadline');
complete_successful_login($pdo, $ticket);
$fresh = reserve_login_attempt($pdo, 'customer', '203.0.113.201', 'target@example.invalid', $now + 2);
login_check(count($fresh) === 4, 'Successful credential did not reset account cooldown');
login_check((int)$pdo->query("SELECT COUNT(*) FROM request_limits WHERE action='login-ip'")->fetchColumn() === 6, 'Success erased other IP failures');
// Success from an older in-flight request must not erase a newer reservation.
$newer = reserve_login_attempt($pdo, 'customer', '203.0.113.202', 'target@example.invalid', $now + 2);
complete_successful_login($pdo, $fresh);
login_check((int)$pdo->query('SELECT COUNT(*) FROM request_limits WHERE id=' . $newer['account']['id'])->fetchColumn() === 1, 'Success erased newer account reservation');
$pdo->exec('DELETE FROM request_limits');
for ($i = 0; $i < 30; $i++) reserve_login_attempt($pdo, 'customer', '198.51.100.1', 'user' . $i, $now);
expect_throttle(fn() => reserve_login_attempt($pdo, 'admin', '198.51.100.1', 'admin@ones.local', $now), 900);
login_check(count(reserve_login_attempt($pdo, 'customer', '198.51.100.1', 'user31', $now + 900)) === 4, 'IP limit failed to expire');
$pdo->exec('DELETE FROM request_limits');
for ($i = 0; $i < 8; $i++) reserve_login_attempt($pdo, 'customer', '198.51.100.1', 'pair', $now + $i * 60);
expect_throttle(fn() => reserve_login_attempt($pdo, 'customer', '198.51.100.1', 'pair', $now + 480), 420);
$pdo->exec('DELETE FROM request_limits');
for ($i = 0; $i < 120; $i++) {
    $systemTicket = reserve_login_attempt($pdo, 'customer', '198.51.100.' . $i, 'user' . $i, $now);
    if ($i < 10) complete_successful_login($pdo, $systemTicket);
}
login_check((int)$pdo->query("SELECT COUNT(*) FROM request_limits WHERE action='login-system'")->fetchColumn() === 120, 'Valid credentials bypassed the system budget');
expect_throttle(fn() => reserve_login_attempt($pdo, 'admin', '203.0.113.1', 'admin@ones.local', $now), 60);
login_check(count(reserve_login_attempt($pdo, 'admin', '203.0.113.1', 'admin@ones.local', $now + 60)) === 4, 'System limit did not expire');
$pdo->exec('DELETE FROM request_limits');
for ($i = 0; $i < 14; $i++) reserve_login_attempt($pdo, 'admin', '198.51.100.' . $i, 'admin@ones.local', $now + $i * 60);
$delay = expect_throttle(fn() => reserve_login_attempt($pdo, 'admin', '203.0.113.1', 'admin@ones.local', $now + 13 * 60));
login_check($delay->retryAfter === 60, 'Progressive account cooldown must be capped');
$pdo->exec('DELETE FROM request_limits');
$pdo->exec(database_driver($pdo) === 'mysql'
    ? "CREATE TRIGGER reject_login_reservation BEFORE INSERT ON request_limits FOR EACH ROW BEGIN IF NEW.action = 'login-account' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected failure'; END IF; END"
    : "CREATE TRIGGER reject_login_reservation BEFORE INSERT ON request_limits WHEN NEW.action='login-account' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
try {
    try { reserve_login_attempt($pdo, 'customer', '198.51.100.1', 'rollback', $now); throw new RuntimeException('Expected DB failure'); }
    catch (PDOException $expected) { login_check((int)$pdo->query('SELECT COUNT(*) FROM request_limits')->fetchColumn() === 0, 'Partial reservation survived rollback'); }
} finally { $pdo->exec('DROP TRIGGER reject_login_reservation'); }
echo 'Login limit checks passed: ' . $checks . ' (' . database_driver($pdo) . ')' . PHP_EOL;
