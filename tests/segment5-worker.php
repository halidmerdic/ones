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
$config = ['database' => $db, 'security' => ['initial_admin_password' => 'Concurrency admin password 2026!']];
if ($input['action'] === 'init') {
    $pdo = database($config);
    if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() !== 1) throw new RuntimeException('Fresh DB required');
    $pdo->prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES (?,?,?,"customer",?)')->execute(['Race', 'race@example.invalid', hash_password('Concurrency customer 2026!'), date('c')]);
    $uid = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO customer_email_state(user_id,email,verified_at) VALUES (?,?,?)')->execute([$uid, 'race@example.invalid', date('c')]);
    echo json_encode(['userId' => $uid]); exit;
}
$pdo = $db['driver'] === 'sqlite' ? new PDO('sqlite:' . $db['sqlite_path']) : new PDO('mysql:host=127.0.0.1;port=' . $db['port'] . ';dbname=' . $db['name'], 'root', '', [PDO::ATTR_EMULATE_PREPARES => false]);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
if ($db['driver'] === 'sqlite') { $pdo->exec('PRAGMA busy_timeout = 15000'); $pdo->exec('PRAGMA foreign_keys = ON'); }
$uid = $input['userId'];
try {
    if ($input['action'] === 'read') $result = cart_payload($pdo, $uid);
    elseif ($input['action'] === 'inspect') $result = ['carts' => table_rows($pdo, 'carts'), 'items' => table_rows($pdo, 'cart_items'), 'orders' => table_rows($pdo, 'orders')];
    elseif ($input['action'] === 'submit') $result = create_order_from_cart($pdo, $uid, $input['cartId'], [], '061123456', 'Concurrent test', false, $input['revision']);
    else $result = mutate_cart($pdo, $uid, $input['cartId'], $input['revision'], $input['action'], $input['body']);
    echo json_encode(['ok' => true, 'result' => $result]);
} catch (CartConflict|OrderSubmissionConflict $error) { echo json_encode(['ok' => false, 'conflict' => true]); }
