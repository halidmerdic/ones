<?php
declare(strict_types=1);

ini_set('session.save_path', sys_get_temp_dir());
$_SERVER['HTTP_HOST'] = 'localhost';
$_SERVER['HTTP_USER_AGENT'] = 'oneS-auth-test';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';

$checks = 0;
$databasePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ones-auth-' . bin2hex(random_bytes(6)) . '.sqlite';

function assert_auth_test(bool $condition, string $message): void
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
    $pdo = database($config);

    assert_auth_test(has_column($pdo, 'users', 'auth_version'), 'baza sadrži verziju autentifikacije');
    assert_auth_test(password_validation_error('kratka-lozinka') !== null, 'kratka nova lozinka se odbija');
    assert_auth_test(password_validation_error(str_repeat('a', 73)) !== null, 'preduga nova lozinka se odbija');
    assert_auth_test(password_validation_error(str_repeat('a', 15)) !== null, 'očigledno ponavljajuća lozinka se odbija');

    $password = 'Sigurna korisnicka lozinka 2026';
    assert_auth_test(password_validation_error($password) === null, 'sigurna korisnička lozinka se prihvata');
    $passwordHash = hash_password($password);
    assert_auth_test(password_verify($password, $passwordHash), 'sigurna lozinka se ispravno hashira i provjerava');

    $insert = $pdo->prepare('INSERT INTO users (name, email, password_hash, role, created_at, auth_version) VALUES (:name, :email, :password_hash, "customer", :created_at, 0)');
    $insert->execute([
        ':name' => 'Test Kupac',
        ':email' => 'auth-test@example.com',
        ':password_hash' => $passwordHash,
        ':created_at' => date('c'),
    ]);
    $userId = (int)$pdo->lastInsertId();

    $identifier = login_identifier('203.0.113.10', 'auth-test@example.com');
    record_request_limit($pdo, 'test-login', $identifier);
    record_request_limit($pdo, 'test-login', $identifier);
    assert_auth_test(request_limit_count($pdo, 'test-login', $identifier, 900) === 2, 'neuspjeli pokušaji se broje u bazi');
    clear_request_limit($pdo, 'test-login', $identifier);
    assert_auth_test(request_limit_count($pdo, 'test-login', $identifier, 900) === 0, 'uspješna prijava može očistiti vezani brojač');

    establish_auth_session('customer', ['id' => $userId, 'name' => 'Test Kupac', 'auth_version' => 0]);
    assert_auth_test(customer_session_active($pdo), 'nova korisnička sesija je aktivna');

    $pdo->prepare('UPDATE users SET auth_version = auth_version + 1 WHERE id = :id')->execute([':id' => $userId]);
    assert_auth_test(!customer_session_active($pdo), 'promjena verzije poništava staru sesiju');

    establish_auth_session('customer', ['id' => $userId, 'name' => 'Test Kupac', 'auth_version' => 1]);
    $_SERVER['HTTP_USER_AGENT'] = 'changed-user-agent';
    assert_auth_test(!customer_session_active($pdo), 'promjena user-agent vrijednosti poništava sesiju');

    echo 'Authentication security checks passed: ' . $checks . PHP_EOL;
} finally {
    unset($insert);
    $pdo = null;
    gc_collect_cycles();
    if (is_file($databasePath)) {
        unlink($databasePath);
    }
}
