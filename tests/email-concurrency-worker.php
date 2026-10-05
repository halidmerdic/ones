<?php
declare(strict_types=1);
require_once __DIR__ . '/database-fixture.php';
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
    $pdo = test_database(['database' => $db, 'security' => ['initial_admin_password' => 'Concurrency admin password 2026!']]);
    if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 1) throw new RuntimeException('Fresh DB required');
    $token = bin2hex(random_bytes(32));
    insert_rows($pdo, 'email_challenges', [['token_hash' => hash('sha256', $token), 'kind' => 'signup', 'user_id' => 0, 'email' => 'race@example.invalid', 'old_email' => '', 'name' => 'Race test', 'auth_version' => 0, 'auth_epoch' => auth_epoch($pdo), 'created_at' => time(), 'expires_at' => time() + 1800, 'sent' => 1]]);
    echo json_encode(['token' => $token]);
} else {
    $pdo = $db['driver'] === 'sqlite' ? new PDO('sqlite:' . $db['sqlite_path']) : new PDO('mysql:host=127.0.0.1;port=' . $db['port'] . ';dbname=' . $db['name'], 'root', '', [PDO::ATTR_EMULATE_PREPARES => false]);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    if ($db['driver'] === 'sqlite') $pdo->exec('PRAGMA busy_timeout = 10000');
    try { confirm_customer_email($pdo, $input['token'], 'One-time customer password 2026!', null); echo '{"accepted":true}'; }
    catch (EmailFlowError $error) { echo json_encode(['accepted' => false, 'status' => $error->status]); }
}
