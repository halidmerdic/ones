<?php
declare(strict_types=1);
require __DIR__ . '/strict-errors.php';
$_SERVER['HTTP_HOST'] = 'localhost';
define('ONES_API_LIBRARY_ONLY', true);
require __DIR__ . '/../api.php';
require __DIR__ . '/../schema-migrations.php';
$checks = 0;
function migration_check(bool $ok, string $message): void { global $checks; if (!$ok) throw new RuntimeException($message); $checks++; }
$settings = ['database' => ['driver' => 'sqlite', 'sqlite_path' => ':memory:'], 'security' => ['initial_admin_password' => 'Migration administrator 2026!']];
if (getenv('ONES_TEST_MYSQL_PORT')) {
    $name = (string)getenv('ONES_TEST_MYSQL_DATABASE');
    if (!preg_match('/^ones_segment_test[0-9]+$/D', $name)) throw new RuntimeException('Disposable database required');
    $settings['database'] = ['driver'=>'mysql','host'=>'127.0.0.1','port'=>getenv('ONES_TEST_MYSQL_PORT'),'name'=>$name,'user'=>'root','password'=>''];
}
$pdo = database_connect($settings, true);
try { require_database_schema($pdo); throw new RuntimeException('Empty schema accepted'); }
catch (DatabaseMigrationRequired $expected) { $checks++; }
migrate_database($pdo, $settings);
require_database_schema($pdo); $checks++;
migration_check((int)$pdo->query('SELECT version FROM schema_version')->fetchColumn() === ONES_SCHEMA_VERSION, 'Version not committed');
migration_check((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 1, 'Seed not unique');
$before = backup_payload($pdo); $epoch = auth_epoch($pdo);
migrate_database($pdo, $settings);
$after = backup_payload($pdo); unset($before['createdAt'], $after['createdAt']);
migration_check($before === $after && auth_epoch($pdo) === $epoch, 'Repeat migration changed application/auth data');
$pdo->exec('UPDATE schema_version SET version=999 WHERE id=1');
try { require_database_schema($pdo); throw new RuntimeException('Future schema accepted'); } catch (DatabaseMigrationRequired $expected) { $checks++; }
try { migrate_database($pdo, $settings); throw new LogicException('Schema downgraded'); } catch (RuntimeException $expected) { $checks++; }
migration_check((int)$pdo->query('SELECT version FROM schema_version')->fetchColumn() === 999, 'Future version overwritten');
$pdo->exec('UPDATE schema_version SET version=' . ONES_SCHEMA_VERSION . ' WHERE id=1');

if (database_driver($pdo) === 'mysql') {
    $pdo->exec("CREATE USER 'ones_runtime'@'127.0.0.1' IDENTIFIED BY 'Disposable runtime password 2026!'");
    $pdo->exec('GRANT SELECT, INSERT, UPDATE, DELETE ON `' . $settings['database']['name'] . '`.* TO \'ones_runtime\'@\'127.0.0.1\'');
    $runtimeSettings = $settings;
    $runtimeSettings['database']['user'] = 'ones_runtime';
    $runtimeSettings['database']['password'] = 'Disposable runtime password 2026!';
    $runtime = database($runtimeSettings);
    migration_check(get_cms_revision($runtime) === 1 && get_cms($runtime)['products'] !== [], 'DML-only runtime connection failed');
    migration_check(order_page($runtime)['pagination']['total'] === 0 && customer_page($runtime)['pagination']['total'] === 0, 'DML-only page query failed');
    try { $runtime->exec('CREATE TABLE forbidden_ddl(id INTEGER)'); throw new LogicException('Runtime unexpectedly has DDL'); }
    catch (PDOException $expected) { $checks++; }
} else {
    $pdo->exec('PRAGMA query_only=ON');
    require_database_schema($pdo);
    migration_check(get_cms_revision($pdo) === 1 && order_page($pdo)['pagination']['total'] === 0, 'Readonly runtime attempted a write');
    $pdo->exec('PRAGMA query_only=OFF');
}

// Adopt a legacy database without the new version ledger or newer columns.
$legacy = database_connect(['database'=>['driver'=>'sqlite','sqlite_path'=>':memory:']], true);
$legacy->exec('CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,created_at TEXT NOT NULL)');
$legacy->prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')->execute(['Željko','legacy@example.invalid',hash_password('Legacy customer password 2026!'),'customer','2020-01-01']);
$legacy->exec('CREATE TABLE orders(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,customer_name TEXT NOT NULL,customer_email TEXT NOT NULL,phone TEXT NOT NULL,note TEXT NOT NULL,status TEXT NOT NULL,items_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)');
$legacy->prepare('INSERT INTO orders(user_id,customer_name,customer_email,phone,note,status,items_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
    ->execute([1,'Željko','legacy@example.invalid','061123456','Original','Novo',json_encode([['name'=>'Stari artikal','productId'=>'old','quantity'=>1,'price'=>'10']]),'2020-01-02T10:00:00+01:00','2020-01-02T10:00:00+01:00']);
$original = $legacy->query('SELECT * FROM orders')->fetch(PDO::FETCH_ASSOC);
migrate_database($legacy, $settings);
$upgraded = $legacy->query('SELECT * FROM orders')->fetch(PDO::FETCH_ASSOC);
unset($upgraded['admin_note']);
migration_check($original === $upgraded, 'Legacy order altered');
migration_check((int)$legacy->query('SELECT COUNT(*) FROM users')->fetchColumn() === 2, 'Legacy customer replaced');
migration_check(order_page($legacy, ['product'=>'stari artikal'])['pagination']['total'] === 1, 'Legacy history index missing');
migration_check(has_column($legacy, 'users', 'auth_version') && has_column($legacy, 'carts', 'revision'), 'Legacy columns missing');
$epoch = auth_epoch($legacy); migrate_database($legacy, $settings);
migration_check(auth_epoch($legacy) === $epoch, 'Repeat adoption invalidated sessions');

$failed = database_connect(['database'=>['driver'=>'sqlite','sqlite_path'=>':memory:']], true);
try { migrate_database($failed, ['security'=>['initial_admin_password'=>'']]); throw new LogicException('Unsafe bootstrap accepted'); }
catch (RuntimeException $expected) { $checks++; }
migration_check((int)$failed->query('SELECT version FROM schema_version WHERE id=1')->fetchColumn() === 0, 'Failed migration recorded success');
migrate_database($failed, $settings);
migration_check((int)$failed->query('SELECT COUNT(*) FROM users')->fetchColumn() === 1, 'Retry failed to finish bootstrap');
echo "Database migrations: $checks checks (" . database_driver($pdo) . ")\n";
